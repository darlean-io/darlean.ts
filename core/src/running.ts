import { ITransport, NatsTransport } from './infra';
import {
    ApplicationStopHandler,
    MultiDeSer,
    IDeSer,
    ITime,
    notifier,
    offApplicationStop,
    onApplicationStop,
    encodeNumber
} from '@darlean/utils';
import { Time } from '@darlean/utils';
import { InstanceContainer, MultiTypeInstanceContainer, VolatileTimer } from './instances';
import { ActorRegistry, ExponentialBackOff, PlacementCache, RemotePortal } from './remoteinvocation';
import { TransportRemote } from './transportremote';
import {
    ACTOR_LOCK_SERVICE,
    ACTOR_REGISTRY_SERVICE,
    IActorCreateContext,
    IActorLockService,
    IActorPlacement,
    IActorRegistrationOptions,
    IActorRegistryService,
    IActorSuite,
    IBackOff,
    IMigrationState,
    IMultiTypeInstanceContainer,
    IPersistence,
    IPersistenceOptions,
    IPersistenceService,
    IPortal,
    IRemote,
    ITablePersistence,
    ITablePersistenceOptions,
    ITablesService,
    IVolatileTimer,
    PERSISTENCE_SERVICE,
    TABLES_SERVICE
} from '@darlean/base';
import { DistributedActorLock, IActorLock } from './distributedactorlock';
import { InProcessTransport } from './infra/inprocesstransport';
import { DistributedActorRegistry } from './distributedactorregistry';
import { DistributedPersistence } from './distributedpersistence';
import { normalizeActorType } from './shared';
import { TablePersistence } from './tablepersistence';
import { IMigrationController, MigrationController } from './migrationcontroller';
import { MigrationPersistence, MigrationTablePersistence } from './migrationpersistence';

export const DEFAULT_CAPACITY = 1000;

export const DEFAULT_LOCAL_APP_ID = 'local';

/**
 * Class that hosts actors and (depending on the configuration) exposes them remotely. Typically
 * created by means of an {@link ActorRunnerBuilder}.
 */
export class ActorRunner {
    protected portal: IPortal;
    protected waiters: Array<() => void>;
    protected delayedStop = 0;
    protected stopped = false;
    protected stopping = false;
    protected starting = false;

    protected starters: Array<{ order: number; name: string; starter: () => Promise<void> }>;
    protected stoppers: Array<{ order: number; name: string; stopper: () => Promise<void> }>;

    constructor(portal: IPortal) {
        this.portal = portal;
        this.waiters = [];
        this.starters = [];
        this.stoppers = [];
    }

    public getPortal(): IPortal {
        return this.portal;
    }

    public async start(): Promise<void> {
        if (this.starting) {
            return;
        }
        this.starting = true;
        for (const starter of this.starters.sort((a, b) => a.order - b.order)) {
            notifier().debug('io.darlean.runner.starter.Invoke', 'Invoking starter [Name].', () => ({ Name: starter.name }));
            try {
                await starter.starter();
                notifier().debug('io.darlean.runner.starter.Done', 'Starter [Name] done', () => ({ Name: starter.name }));
            } catch (e) {
                notifier().error('io.darlean.runner.starter.Failed', 'Unable to invoke starter [Name]: [Error]', () => ({
                    Name: starter.name,
                    Error: e
                }));
                throw e;
            }
        }
    }

    public async stop(): Promise<void> {
        if (this.stopped) {
            return;
        }
        if (this.stopping) {
            await this.run();
            return;
        }
        this.stopping = true;

        for (const stopper of this.stoppers.sort((a, b) => b.order - a.order)) {
            await stopper.stopper();
        }

        this.stopped = true;

        const waiters = this.waiters;
        this.waiters = [];
        for (const waiter of waiters) {
            waiter();
        }
    }

    public addStarter(starter: () => Promise<void>, order: number, name: string) {
        this.starters.push({ order, starter, name });
    }

    public addStopper(stopper: () => Promise<void>, order: number, name: string) {
        this.stoppers.push({ order, stopper, name });
    }

    /**
     * Starts the actor runner when not already started before, and waits until the actor runner is stopped, either explicitly
     * by calling the {@link stop} method, or because of application termination signals.
     */
    public async run(): Promise<void> {
        if (this.stopped) {
            return;
        }

        // Will do nothing when already starting or started
        await this.start();

        return new Promise((resolve) => {
            this.waiters.push(resolve);
        });
    }
}

/**
 * Class that can be used to build an {@link ActorRunner} based on provided configuration.
 */
export class ActorRunnerBuilder {
    protected actors: IActorRegistrationOptions<object, IMigrationState>[];
    protected portal?: IPortal;
    protected persistenceFactory?: IPersistence<unknown> | ((specifier?: string) => IPersistence<unknown>);
    protected appId: string;
    protected transport?: ITransport;
    protected remote?: IRemote;
    protected time?: ITime;
    protected defaultApps?: string[];
    protected runtimeApps?: string[];
    protected multiContainer?: MultiTypeInstanceContainer;
    protected transportMechanism: '' | 'nats' = '';
    protected distributedRegistry?: DistributedActorRegistry;
    protected deser?: IDeSer;

    constructor() {
        this.appId = DEFAULT_LOCAL_APP_ID;
        this.actors = [];
    }

    /**
     * Registers an individual actor that must be hosted by the actor runner.
     * @param options The options for the actor.
     * @returns The builder
     */
    public registerActor<T extends object, T2 extends IMigrationState>(
        options: IActorRegistrationOptions<T, T2>
    ): ActorRunnerBuilder {
        this.actors.push(options as unknown as IActorRegistrationOptions<object, IMigrationState>);
        return this;
    }

    /**
     * Registers a suite of actors that must be hosted by the actor runner.
     * @param suite The suite to be registered
     * @returns The builder
     */
    public registerSuite(suite: IActorSuite | undefined): ActorRunnerBuilder {
        if (suite) {
            for (const options of suite.getRegistrationOptions()) {
                this.registerActor(options);
            }
        }
        return this;
    }

    /**
     * Sets a list of appId's on which the runner will search for actors that do not
     * explicitly have their apps setting configured.
     * @param hosts
     */
    public setDefaultApps(apps: string[]): ActorRunnerBuilder {
        this.defaultApps = apps;
        return this;
    }

    public setRuntimeApps(apps: string[]): ActorRunnerBuilder {
        this.runtimeApps = apps;

        // Always register the actor registry service so that we can find it (chicken-egg problem: without actor
        // registry service, we cannot find the actor registry service).
        // Note: We do not RUN the actor registry service (we do not specify a creator); we just make sure that
        // we can FIND it.

        this.registerActor({
            type: ACTOR_REGISTRY_SERVICE,
            kind: 'singular',
            apps: apps
        });

        return this;
    }

    /**
     * Configures the builder to allow remote access via Nats.
     * @param appId The app-id under which the actor runner will register to the cluster.
     * @param transport Optional transport that is used for remote access. When omitted,
     * the builder creates a {@link NatsTransport}.
     */
    public setRemoteAccess(appId: string, transport?: ITransport): ActorRunnerBuilder {
        this.appId = appId;
        this.transport = transport;
        this.transportMechanism = 'nats';
        return this;
    }

    /**
     * Overrides the default distributed persistence which is automatically enabled when {@link setPersistence} is not invoked.
     * @param persistence
     */
    public setPersistence(factory: IPersistence<unknown> | ((specifier?: string) => IPersistence<unknown>)) {
        this.persistenceFactory = factory;
    }

    /**
     * Builds a new {@link ActorRunner} based on the provided configuration.
     * @returns a new ActorRunner
     */
    public build(): ActorRunner {
        const time = this.createTime();
        this.time = time;
        const backoff = this.createBackOff(time);
        const multiContainer = this.createMultiContainer();
        this.multiContainer = multiContainer;
        const portal = this.createPortal(backoff, this.transport, time, multiContainer);
        this.portal = portal;
        this.deser = new MultiDeSer();
        if (!this.persistenceFactory) {
            this.persistenceFactory = this.createPersistenceFactory(portal);
        }
        const ar = new ActorRunner(portal);
        this.configurePortal(ar);

        this.registerAutoStarts(ar, time);
        return ar;
    }

    /**
     *
     * @returns a reference to the persistence service of the actor runner.
     */
    public getPersistence(): IPersistence<unknown> | undefined {
        return typeof this.persistenceFactory === 'function' ? this.persistenceFactory('') : this.persistenceFactory;
    }

    private createTime(): ITime {
        return new Time();
    }

    private createBackOff(time: ITime): IBackOff {
        return new ExponentialBackOff(time, 10, 4);
    }

    private createActorLock(portal: IPortal, time: ITime, appId: string): IActorLock {
        const servicePortal = portal.typed<IActorLockService>(ACTOR_LOCK_SERVICE);
        const service = servicePortal.retrieve([]);
        return new DistributedActorLock(time, service, appId);
    }

    private createPortal(
        backoff: IBackOff,
        transport: ITransport | undefined,
        time: ITime,
        multiContainer: MultiTypeInstanceContainer
    ): IPortal {
        return this.createRemotePortal(backoff, this.appId, transport, time, multiContainer, this.transportMechanism);
    }

    private configurePortal(ar: ActorRunner) {
        const handler: ApplicationStopHandler = (signal, code, error) => {
            if (signal) {
                console.log('Received stop signal', signal);
            } else if (code) {
                console.log('Received exit with code', code);
            } else if (error) {
                console.log('Uncaught error', error);
            }

            setImmediate(async () => {
                try {
                    await ar.stop();
                } catch (e) {
                    console.log(e);
                }
                console.log('STOPPED');
            });
        };

        ar.addStarter(
            async () => {
                onApplicationStop(handler);

                if (this.remote) {
                    notifier().info('io.darlean.transport.Init', 'Initializing transport...');
                    try {
                        await (this.remote as TransportRemote).init();
                        notifier().info('io.darlean.transport.Initialized', 'Transport initialized.');
                    } catch (e) {
                        notifier().error('io.darlean.transport.Failed', 'Failed to initialize transport: [Error]', () => ({
                            Error: e
                        }));
                        throw e;
                    }
                }

                if (this.distributedRegistry) {
                    this.distributedRegistry.start();
                }
            },
            50,
            'default'
        );

        ar.addStopper(
            async () => {
                offApplicationStop(handler);

                if (this.distributedRegistry) {
                    await this.distributedRegistry.stop();
                }

                await this.multiContainer?.finalize();

                if (this.remote) {
                    await (this.remote as TransportRemote).finalize();
                }
            },
            50,
            'default'
        );
    }

    private createMultiContainer(): MultiTypeInstanceContainer {
        return new MultiTypeInstanceContainer();
    }

    private fillContainers(multiContainer: MultiTypeInstanceContainer, actorLock: IActorLock): void {
        for (const actor of this.actors) {
            const creator = actor.creator;
            if (creator) {
                const migrations = Array.isArray(actor.migrations) ? actor.migrations : actor.migrations?.migrations ?? [];
                const mc = new MigrationController<IMigrationState>(migrations);

                const container =
                    actor.container ??
                    new InstanceContainer(
                        actor.type,
                        (id) => {
                            const timers: VolatileTimer<object>[] = [];
                            const context = this.createActorCreateContext(actor.type, id, timers, mc);
                            return {
                                instance: creator(context),
                                afterCreate: (wrapper) => {
                                    for (const timer of timers) {
                                        timer.setWrapper(wrapper);
                                    }
                                    context.performFinalization = () => {
                                        return wrapper.deactivate();
                                    };
                                }
                            };
                        },
                        actor.capacity ?? DEFAULT_CAPACITY,
                        actor.kind === 'singular' ? actorLock : undefined,
                        this.time,
                        actor.maxAgeSeconds
                    );
                multiContainer.register(actor.type, container);
            }
        }
    }

    private createRemotePortal(
        backoff: IBackOff,
        appId: string,
        transport: ITransport | undefined,
        time: ITime,
        multiContainer: MultiTypeInstanceContainer,
        mechanism: typeof this.transportMechanism
    ): IPortal {
        const remote = this.createRemote(appId, multiContainer, mechanism, transport);
        this.remote = remote;
        const registry = new ActorRegistry();
        const placementCache = new PlacementCache(10000);
        const portal = new RemotePortal(remote, backoff, registry, placementCache, appId);

        const registryService = portal.retrieve<IActorRegistryService>(ACTOR_REGISTRY_SERVICE, []);
        const distributedRegistry = new DistributedActorRegistry(registryService, time, appId, registry);
        this.distributedRegistry = distributedRegistry;
        portal.setRegistry(distributedRegistry);

        const actorLock = this.createActorLock(portal, time, appId);
        this.fillContainers(multiContainer, actorLock);

        for (const actor of this.actors) {
            const hosts = actor.apps ?? this.defaultApps ?? [this.appId];
            if (hosts) {
                for (const host of hosts) {
                    const placement: IActorPlacement = actor.placement
                        ? { ...actor.placement }
                        : {
                              version: new Date().toISOString()
                          };
                    if (actor.kind === 'singular' && placement.sticky === undefined) {
                        placement.sticky = true;
                    }
                    let migrationVersion: string | undefined;
                    if (actor.migrations) {
                        if (Array.isArray(actor.migrations)) {
                            migrationVersion = actor.migrations[actor.migrations.length - 1]?.version;
                        } else {
                            migrationVersion = actor.migrations.migrations[actor.migrations.migrations.length - 1]?.version;
                        }
                    }
                    if (migrationVersion) {
                        migrationVersion = encodeNumber(parseInt(migrationVersion.split('.')[0]));
                    } else {
                        migrationVersion = undefined;
                    }
                    registry.addMapping(actor.type, host, placement, migrationVersion);
                }
            }
        }

        return portal;
    }

    private createRemote(
        appId: string,
        container: IMultiTypeInstanceContainer,
        mechanism: typeof this.transportMechanism,
        transport?: ITransport
    ): IRemote {
        if (!transport) {
            const deser = new MultiDeSer();
            if (mechanism === 'nats') {
                transport = new NatsTransport(deser);
            } else {
                transport = new InProcessTransport(deser);
            }
        }
        this.transport = transport;
        return new TransportRemote(appId, transport, container);
    }

    private createPersistenceFactory(portal: IPortal): (specifier?: string) => IPersistence<unknown> {
        if (!this.deser) {
            throw new Error('No deser');
        }
        const deser = this.deser;

        return (specifier?) => {
            const servicePortal = portal.typed<IPersistenceService>(PERSISTENCE_SERVICE);
            const service = servicePortal.retrieve([]);
            return new DistributedPersistence(service, deser, specifier);
        };
    }

    private createActorCreateContext<MigrationState extends IMigrationState>(
        type: string,
        id: string[],
        timers: IVolatileTimer[],
        mc: IMigrationController<MigrationState>
    ): IActorCreateContext<MigrationState> {
        const normalizedType = normalizeActorType(type);

        if (!this.portal) {
            throw new Error('No portal assigned');
        }

        const persistenceFactory = this.persistenceFactory;
        if (!persistenceFactory) {
            throw new Error('No persistence assigned');
        }

        const time = this.time;
        if (time === undefined) {
            throw new Error('No time assigned');
        }

        return {
            id,
            portal: this.portal,
            persistence: <T>(specifierOrOptions?: string | IPersistenceOptions) => {
                const options: IPersistenceOptions =
                    typeof specifierOrOptions === 'string'
                        ? {
                              scope: 'actor',
                              id: id,
                              actorType: normalizedType,
                              specifier: specifierOrOptions,
                              migrations: true
                          }
                        : {
                              scope: specifierOrOptions?.scope ?? 'actor',
                              id: specifierOrOptions?.id ?? id,
                              actorType: specifierOrOptions?.actorType ?? normalizedType,
                              specifier: specifierOrOptions?.specifier,
                              migrations: specifierOrOptions?.migrations ?? true
                          };

                const typePersistence = (
                    typeof persistenceFactory === 'function' ? persistenceFactory(options.specifier) : persistenceFactory
                ) as IPersistence<T>;

                let p: IPersistence<IMigrationState> = typePersistence as IPersistence<IMigrationState>;

                if (options.scope === 'actor') {
                    if (!options.actorType) {
                        throw new Error('No actor type');
                    }

                    if (!options.id) {
                        throw new Error('No actor id');
                    }

                    // The id-length is there to prevent malicious code from accessing persistent data
                    // from other actors.
                    // When actor 1 has id ['a', 'b'] and stores state in ['c];
                    // actor 2 with id ['a'] and state in ['b', 'c'] would mess with actor 1's data.
                    // Including id length prevents this: ['type', '2', 'a', 'b', 'c'] !== ['type', '1', 'a', 'b', 'c'].
                    p = typePersistence.sub([
                        options.actorType,
                        options.id.length.toString(),
                        ...options.id
                    ]) as IPersistence<IMigrationState>;
                }

                if (options.migrations) {
                    return new MigrationPersistence(p, mc) as IPersistence<unknown> as IPersistence<T>;
                }
                return p;
            },
            tablePersistence: <T>(options: ITablePersistenceOptions<T>) => {
                if (!this.portal) {
                    throw new Error('No portal');
                }
                if (!options.id) {
                    throw new Error('Table persistence options must specify the "id" field');
                }
                if (!options.scope) {
                    throw new Error('Table persistence options must specify the "scope" field');
                }
                const tableId =
                    options.scope === 'actor'
                        ? [normalizedType, id.length.toString(), ...id, options.id.length.toString(), ...options.id]
                        : options.id;
                const service = this.portal.retrieve<ITablesService>(TABLES_SERVICE, tableId);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const tp = new TablePersistence<T>(service, options.indexer ?? (() => []), this.deser!, options.specifier);
                return new MigrationTablePersistence(
                    tp as ITablePersistence<IMigrationState>,
                    mc
                ) as ITablePersistence<unknown> as ITablePersistence<T>;
            },
            time,
            newVolatileTimer: () => {
                const timer = new VolatileTimer<object>(time);
                timers.push(timer);
                return timer as IVolatileTimer;
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            deser: this.deser!,
            migrationContext: <Context = undefined>(c: Context) => {
                return (mc as IMigrationController<MigrationState, Context>).getContext(c);
            },
            performFinalization: async () => {
                // Will be uverruled in fillContainers where we have access to the wrapper
            }
        };
    }

    private registerAutoStarts(ar: ActorRunner, time: ITime) {
        const autoStartHandlers = this.actors.filter((a) => a.startHandlers);
        if (autoStartHandlers.length > 0) {
            ar.addStarter(
                async () => {
                    for (const actor of autoStartHandlers) {
                        if (actor.startHandlers) {
                            for (const h of actor.startHandlers) {
                                notifier().info('io.darlean.runner.AutoStarting', `Starting [Name]...`, () => ({ Name: h.name }));
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                await h.handler(ar.getPortal(), time);
                                notifier().info('io.darlean.runner.AutoStarted', `Started [Name]`, () => ({ Name: h.name }));
                            }
                        }
                    }
                },
                98,
                'Autostart Actor Handlers'
            );
        }

        const autoStopHandlers = this.actors.filter((a) => a.stopHandlers);
        if (autoStopHandlers.length > 0) {
            ar.addStopper(
                async () => {
                    for (const actor of autoStopHandlers) {
                        if (actor.stopHandlers) {
                            for (const h of actor.stopHandlers) {
                                notifier().info('io.darlean.runner.AutoStopping', `Starting [Name]...`, () => ({ Name: h.name }));
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                await h.handler(ar.getPortal(), time);
                                notifier().info('io.darlean.runner.AutoStopped', `Stopped [Name]`, () => ({ Name: h.name }));
                            }
                        }
                    }
                },
                98,
                'Autostop Actor Handlers'
            );
        }

        const autoStartActors = this.actors.filter((a) => a.startActions);
        if (autoStartActors.length > 0) {
            ar.addStarter(
                async () => {
                    for (const actor of autoStartActors) {
                        const portal = this.portal?.typed<object>(actor.type);
                        if (portal && actor.startActions) {
                            for (const a of actor.startActions) {
                                notifier().info('io.darlean.runner.AutoStarting', `Starting [Name]...`, () => ({ Name: a.name }));
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                await (portal.retrieve(a.id) as any)[a.action](...(a.arguments ?? []));
                                notifier().info('io.darlean.runner.AutoStarted', `Started [Name]`, () => ({ Name: a.name }));
                            }
                        }
                    }
                },
                99,
                'Autostart Actors'
            );
        }
    }
}
