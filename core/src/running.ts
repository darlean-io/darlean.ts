import { EventEmitter } from 'events';
import { ITransport, NatsTransport } from './infra';
import { BsonDeSer } from './infra/bsondeser';
import { ITime } from '@darlean/utils';
import { Time } from '@darlean/utils';
import { sleep } from '@darlean/utils';
import { InstanceContainer, MultiTypeInstanceContainer, VolatileTimer } from './instances';
import { LocalPortal } from './localinvocation';
import { MemoryPersistence } from './various';
import { ExponentialBackOff, RemotePortal } from './remoteinvocation';
import { TransportRemote } from './transportremote';
import {
    IActorCreateContext,
    IActorRegistrationOptions,
    IActorSuite,
    IBackOff,
    IMultiTypeInstanceContainer,
    IPersistence,
    IPortal,
    IRemote,
    IVolatileTimer
} from '@darlean/base';

export const DEFAULT_CAPACITY = 1000;

export declare interface ActorRunner {
    on(event: 'start', listener: () => void): this;
    on(event: 'stop', listener: () => void): this;
}

/**
 * Class that hosts actors and (depending on the configuration) exposes them remotely. Typically
 * created by means of an {@link ActorRunnerBuilder}.
 */
export class ActorRunner extends EventEmitter {
    protected portal: IPortal;

    constructor(portal: IPortal) {
        super();
        this.portal = portal;
    }

    public getPortal(): IPortal {
        return this.portal;
    }

    public async start(): Promise<void> {
        this.emit('start');
        await sleep(100);
    }

    public async stop(): Promise<void> {
        this.emit('stop');
        await sleep(100);
    }
}

/**
 * Abstraction of a registry to which actors can be registered.
 */
export interface IActorRegistry {
    registerActor<T extends object>(options: IActorRegistrationOptions<T>): void;
}

export class ActorSuite implements IActorSuite {
    protected options: IActorRegistrationOptions<object>[];

    constructor(actors: IActorRegistrationOptions<object>[] = []) {
        this.options = [];

        for (const item of actors) {
            this.addActor(item);
        }
    }

    public addActor(options: IActorRegistrationOptions<object>) {
        this.options.push(options);
    }

    public addSuite(suite: IActorSuite) {
        for (const options of suite.getRegistrationOptions()) {
            this.addActor(options);
        }
    }

    public getRegistrationOptions(): IActorRegistrationOptions<object>[] {
        return this.options;
    }

    protected addItem(item: ActorOrSuite) {
        if (item.actor) {
            this.addActor(item.actor);
        }

        if (item.suite) {
            this.addSuite(item.suite);
        }
    }
}

export interface ActorOrSuite {
    actor?: IActorRegistrationOptions<object>;
    suite?: IActorSuite;
}

/**
 * Class that can be used to build an {@link ActorRunner} based on provided configuration.
 */
export class ActorRunnerBuilder implements IActorRegistry {
    protected actors: IActorRegistrationOptions<object>[];
    protected portal?: IPortal;
    protected persistence?: IPersistence<unknown>;
    protected appId?: string;
    protected transport?: ITransport;
    protected remote?: IRemote;
    protected time?: ITime;
    protected defaultHosts?: string[];

    constructor() {
        this.actors = [];
    }

    /**
     * Registers an actor that must be hosted by the actor runner.
     * @param options The options for the actor.
     */
    public registerActor<T extends object>(options: IActorRegistrationOptions<T>): ActorRunnerBuilder {
        this.actors.push(options);
        return this;
    }

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
    public setDefaultHosts(hosts: string[]) {
        this.defaultHosts = hosts;
    }

    /**
     * Configures the builder to allow remote access via Nats.
     * @param appId The app-id under which the actor runner will register to the cluster.
     */
    public setRemoteAccess(appId: string, transport?: ITransport): ActorRunnerBuilder {
        this.appId = appId;
        this.transport = transport;
        return this;
    }

    /**
     * Builds a new {@link ActorRunner} based on the provided configuration.
     * @returns a new ActorRunner
     */
    public build(): ActorRunner {
        const time = this.createTime();
        this.time = time;
        const backoff = this.createBackOff(time);
        const portal = this.createPortal(backoff, this.transport);
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

    protected createTime(): ITime {
        return new Time();
    }

    protected createBackOff(time: ITime): IBackOff {
        return new ExponentialBackOff(time, 10, 4);
    }

    protected createPortal(backoff: IBackOff, transport?: ITransport): IPortal {
        if (this.appId) {
            return this.createRemotePortal(backoff, this.appId, transport);
        } else {
            return this.createLocalPortal(backoff);
        }
    }

    protected configurePortal(ar: ActorRunner) {
        if (this.transport) {
            ar.on('start', () => {
                if (this.remote) {
                    (this.remote as TransportRemote).init();
                }
            });
            ar.on('stop', () => {
                if (this.remote) {
                    (this.remote as TransportRemote).finalize();
                }
            });
        }
    }

    protected createLocalPortal(backoff: IBackOff): IPortal {
        const portal = new LocalPortal(backoff);
        for (const actor of this.actors) {
            const creator = actor.creator;
            if (creator) {
                const container =
                    actor.container ??
                    new InstanceContainer((id) => {
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
                    }, actor.capacity ?? DEFAULT_CAPACITY);

                portal.register(actor.type, container);
                }
        }
        return portal;
    }

    protected createRemotePortal(backoff: IBackOff, appId: string, transport?: ITransport): IPortal {
        const multiContainer = new MultiTypeInstanceContainer();
        const remote = this.createRemote(appId, multiContainer, transport);
        this.remote = remote;
        const portal = new RemotePortal(remote, backoff);

        for (const actor of this.actors) {
            const creator = actor.creator;
            if (creator) {
                const container =
                    actor.container ??
                    new InstanceContainer((id) => {
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
                    }, actor.capacity ?? DEFAULT_CAPACITY);
                multiContainer.register(actor.type, container);
            }
            const hosts = actor.hosts ?? this.defaultHosts;
            if (hosts) {
                for (const host of hosts) {
                    portal.addMapping(actor.type, host, actor.placement);
                }
            }
        }

        return portal;
    }

    protected createRemote(appId: string, container: IMultiTypeInstanceContainer, transport?: ITransport): IRemote {
        if (!transport) {
            const deser = new BsonDeSer();
            transport = new NatsTransport(deser);
        }
        this.transport = transport;
        return new TransportRemote(appId, transport, container);
    }

    protected createPersistence(): IPersistence<unknown> {
        return new MemoryPersistence();
    }

    protected createActorCreateContext(type: string, id: string[], timers: IVolatileTimer[]): IActorCreateContext {
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
            newVolatileTimer: () => {
                const timer = new VolatileTimer<object>(time);
                timers.push(timer);
                return timer as IVolatileTimer;
            }
        };
    }
}
