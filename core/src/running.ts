import { ITransport, NatsTransport } from './infra';
import { BsonDeSer } from './infra/bsondeser';
import { ApplicationStopHandler, ITime, notifier, offApplicationStop, onApplicationStop } from '@darlean/utils';
import { Time } from '@darlean/utils';
import { InstanceContainer, MultiTypeInstanceContainer, VolatileTimer } from './instances';
import { ActorRegistry, ExponentialBackOff, PlacementCache, RemotePortal } from './remoteinvocation';
import { TransportRemote } from './transportremote';
import {
    IActorCreateContext,
    IActorPlacement,
    IActorRegistrationOptions,
    IActorSuite,
    IBackOff,
    IMultiTypeInstanceContainer,
    IPersistence,
    IPortal,
    IRemote,
    IVolatileTimer,
    PERSISTENCE_SERVICE
} from '@darlean/base';
import { ACTOR_LOCK_SERVICE, IActorLockService } from '@darlean/actor-lock-suite';
import actorLockSuite from '@darlean/actor-lock-suite';
import { DistributedActorLock, IActorLock } from './distributedactorlock';
import { InProcessTransport } from './infra/inprocesstransport';
import { DistributedActorRegistry } from './distributedactorregistry';
import { ACTOR_REGISTRY_SERVICE, IActorRegistryService } from '@darlean/actor-registry-suite';
import actorRegistrySuite from '@darlean/actor-registry-suite';
import { DistributedPersistence } from './distributedpersistence';
import { IDeSer } from './infra/deser';
import persistenceSuite, { IPersistenceService, IPersistenceServiceOptions } from '@darlean/persistence-suite';
import fsPersistenceSuite, { IFsPersistenceOptions } from '@darlean/fs-persistence-suite';
import { normalizeActorType } from './shared';

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
    protected actors: IActorRegistrationOptions<object>[];
    protected portal?: IPortal;
    protected persistenceFactory?: IPersistence<unknown> | ((actorType: string, specifiers?: string[]) => IPersistence<unknown>);
    protected appId: string;
    protected transport?: ITransport;
    protected remote?: IRemote;
    protected time?: ITime;
    protected defaultApps?: string[];
    protected runtimeApps?: string[];
    protected multiContainer?: MultiTypeInstanceContainer;
    protected transportMechanism: '' | 'nats' = '';
    protected distributedRegistry?: DistributedActorRegistry;

    constructor() {
        this.appId = DEFAULT_LOCAL_APP_ID;
        this.actors = [];
    }

    /**
     * Registers an individual actor that must be hosted by the actor runner.
     * @param options The options for the actor.
     * @returns The builder
     */
    public registerActor<T extends object>(options: IActorRegistrationOptions<T>): ActorRunnerBuilder {
        this.actors.push(options as unknown as IActorRegistrationOptions<object>);
        return this;
    }

    /**
     * Registers a suite of actors that must be hosted by the actor runner.
     * @param suite The suite to be registered
     * @returns The builder
     */
    public registerSuite(suite: IActorSuite): ActorRunnerBuilder {
        for (const options of suite.getRegistrationOptions()) {
            this.registerActor(options);
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

    public hostActorLock(nodes: string[], redundancy: number) {
        const suite = actorLockSuite({
            locks: nodes,
            id: [],
            redundancy
        });
        this.registerSuite(suite);
    }

    public hostActorRegistry(nodes: string[]) {
        const suite = actorRegistrySuite(nodes);
        this.registerSuite(suite);
    }

    public hostPersistence(options: IPersistenceServiceOptions) {
        const suite = persistenceSuite(options);
        this.registerSuite(suite);
    }

    public hostFsPersistence(options: IFsPersistenceOptions) {
        const suite = fsPersistenceSuite(options);
        this.registerSuite(suite);
    }

    /**
     * Overrides the default distributed persistence which is automatically enabled when {@link setPersistence} is not invoked.
     * @param persistence
     */
    public setPersistence(
        factory: IPersistence<unknown> | ((actorType: string, specifiers?: string[]) => IPersistence<unknown>)
    ) {
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
        if (!this.persistenceFactory) {
            this.persistenceFactory = this.createPersistence(portal, new BsonDeSer());
        }
        const ar = new ActorRunner(portal);
        this.configurePortal(ar);

        this.registerAutoStarts(ar);
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

    private fillContainers(multiContainer: MultiTypeInstanceContainer, portal: IPortal, actorLock: IActorLock): void {
        for (const actor of this.actors) {
            const creator = actor.creator;
            if (creator) {
                const container =
                    actor.container ??
                    new InstanceContainer(
                        actor.type,
                        (id) => {
                            const timers: VolatileTimer<object>[] = [];
                            const context = this.createActorCreateContext(actor.type, id, timers);
                            return {
                                instance: creator(context),
                                afterCreate: (wrapper) => {
                                    for (const timer of timers) {
                                        timer.setWrapper(wrapper);
                                    }
                                }
                            };
                        },
                        actor.capacity ?? DEFAULT_CAPACITY,
                        actor.kind === 'singular' ? actorLock : undefined
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
        const portal = new RemotePortal(remote, backoff, registry, placementCache);

        const registryService = portal.retrieve<IActorRegistryService>(ACTOR_REGISTRY_SERVICE, []);
        const distributedRegistry = new DistributedActorRegistry(registryService, time, appId, registry);
        this.distributedRegistry = distributedRegistry;
        portal.setRegistry(distributedRegistry);

        const actorLock = this.createActorLock(portal, time, appId);
        this.fillContainers(multiContainer, portal, actorLock);

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
                    registry.addMapping(actor.type, host, placement);
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
            const deser = new BsonDeSer();
            if (mechanism === 'nats') {
                transport = new NatsTransport(deser);
            } else {
                transport = new InProcessTransport(deser);
            }
        }
        this.transport = transport;
        return new TransportRemote(appId, transport, container);
    }

    private createPersistence(portal: IPortal, deser: IDeSer): (type: string, specifiers?: string[]) => IPersistence<unknown> {
        return (_type, specifiers?) => {
            const servicePortal = portal.typed<IPersistenceService>(PERSISTENCE_SERVICE);
            const service = servicePortal.retrieve([]);
            return new DistributedPersistence(service, deser, specifiers);
        };
    }

    private createActorCreateContext(type: string, id: string[], timers: IVolatileTimer[]): IActorCreateContext {
        type = normalizeActorType(type);

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
            persistence: <T>(specifiers?: string | string[]) => {
                // The id-length is there to prevent malicious code from accessing persistent data
                // from other actors.
                // When actor 1 has id ['a', 'b'] and stores state in ['c];
                // actor 2 with id ['a'] and state in ['b', 'c'] would mess with actor 1's data.
                // Including id length prevents this: ['type', '2', 'a', 'b', 'c'] !== ['type', '1', 'a', 'b', 'c'].
                if (typeof specifiers === 'string') {
                    specifiers = [specifiers];
                }
                const typePersistence =
                    typeof persistenceFactory === 'function' ? persistenceFactory(type, specifiers) : persistenceFactory;
                return typePersistence.sub([type, id.length.toString(), ...id]) as IPersistence<T>;
            },
            time,
            newVolatileTimer: () => {
                const timer = new VolatileTimer<object>(time);
                timers.push(timer);
                return timer as IVolatileTimer;
            }
        };
    }

    private registerAutoStarts(ar: ActorRunner) {
        const autoStartActors = this.actors.filter((a) => a.startActions);
        if (autoStartActors.length > 0) {
            ar.addStarter(
                async () => {
                    for (const actor of autoStartActors) {
                        const portal = this.portal?.typed<object>(actor.type);
                        if (portal && actor.startActions) {
                            for (const a of actor.startActions) {
                                notifier().info('io.darlean.runner.AutoStarting', `Starting [Name]...`, () => ({ Name: a.name }));
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
