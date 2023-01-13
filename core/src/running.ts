import { ITransport, NatsTransport } from './infra';
import { BsonDeSer } from './infra/bsondeser';
import { ITime } from '@darlean/utils';
import { Time } from '@darlean/utils';
import { InstanceContainer, MultiTypeInstanceContainer, VolatileTimer } from './instances';
import { MemoryPersistence } from './various';
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
    IVolatileTimer
} from '@darlean/base';
import { ACTOR_LOCK_SERVICE, IActorLockService } from '@darlean/actor-lock-suite';
import actorLockSuite from '@darlean/actor-lock-suite';
import { DistributedActorLock, IActorLock } from './actorlock';
import { InProcessTransport } from './infra/inprocesstransport';
import { DistributedActorRegistry } from './distributedactorregistry';
import { ACTOR_REGISTRY_SERVICE, IActorRegistryService } from '@darlean/actor-registry-suite';
import actorRegistrySuite from '@darlean/actor-registry-suite';

export const DEFAULT_CAPACITY = 1000;

export const DEFAULT_LOCAL_APP_ID = 'local';

export declare interface ActorRunner {
    on(event: 'start', listener: () => void): this;
    on(event: 'stop', listener: () => void): this;
}

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

    protected starters: Array<() => Promise<void>>;
    protected stoppers: Array<() => Promise<void>>;

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
        for (const starter of this.starters) {
            await starter();
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

        for (const stopper of Array.from(this.stoppers).reverse()) {
            await stopper();
        }

        this.stopped = true;

        const waiters = this.waiters;
        this.waiters = [];
        for (const waiter of waiters) {
            waiter();
        }
    }

    public addStarter(starter: () => Promise<void>) {
        this.starters.push(starter);
    }

    public addStopper(stopper: () => Promise<void>) {
        this.stoppers.push(stopper);
    }

    /**
     * Waits until the actor runner is stopped
     */
    public async run(): Promise<void> {
        if (this.stopped) {
            return;
        }

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
    protected persistence?: IPersistence<unknown>;
    protected appId: string;
    protected transport?: ITransport;
    protected remote?: IRemote;
    protected time?: ITime;
    protected defaultHosts?: string[];
    protected runtimeHosts?: string[];
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
        this.actors.push(options);
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
     * Sets a list of hosts on which the runner will search for actors that do not
     * explicitly have their hosts setting configured.
     * @param hosts
     */
    public setDefaultHosts(hosts: string[]): ActorRunnerBuilder {
        this.defaultHosts = hosts;
        return this;
    }

    public setRuntimeHosts(hosts: string[]): ActorRunnerBuilder {
        this.runtimeHosts = hosts;

        this.registerActor({
            type: ACTOR_REGISTRY_SERVICE,
            kind: 'singular',
            hosts: hosts
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

    public hostActorRegistry() {
        const suite = actorRegistrySuite();
        this.registerSuite(suite);
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
        this.persistence = this.createPersistence();
        const ar = new ActorRunner(portal);
        this.configurePortal(ar);
        return ar;
    }

    /**
     *
     * @returns a reference to the persistence service of the actor runner.
     */
    public getPersistence(): IPersistence<unknown> | undefined {
        return this.persistence;
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
        const signalHandler = () => {
            console.log('RECEIVED STOP SIGNAL');
            process.nextTick(async () => {
                try {
                    await ar.stop();
                } catch (e) {
                    console.log(e);
                }
                console.log('STOPPED');
            });
        };

        ar.addStarter(async () => {
            process.on('SIGINT', signalHandler);
            process.on('SIGTERM', signalHandler);

            if (this.remote) {
                await (this.remote as TransportRemote).init();
            }

            if (this.distributedRegistry) {
                this.distributedRegistry.start();
            }
        });

        ar.addStopper(async () => {
            process.off('SIGINT', signalHandler);
            process.off('SIGTERM', signalHandler);

            if (this.distributedRegistry) {
                this.distributedRegistry.stop();
            }

            await this.multiContainer?.finalize();

            if (this.remote) {
                await (this.remote as TransportRemote).finalize();
            }
        });
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
            const hosts = actor.hosts ?? this.defaultHosts;
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

    private createPersistence(): IPersistence<unknown> {
        return new MemoryPersistence();
    }

    private createActorCreateContext(type: string, id: string[], timers: IVolatileTimer[]): IActorCreateContext {
        if (!this.portal) {
            throw new Error('No portal assigned');
        }

        if (!this.persistence) {
            throw new Error('No persistence assigned');
        }

        const time = this.time;
        if (time === undefined) {
            throw new Error('No time assigned');
        }

        return {
            id,
            portal: this.portal,
            persistence: this.persistence.sub([type, ...id]),
            time,
            newVolatileTimer: () => {
                const timer = new VolatileTimer<object>(time);
                timers.push(timer);
                return timer as IVolatileTimer;
            }
        };
    }
}
