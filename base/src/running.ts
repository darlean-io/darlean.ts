import { ITime } from '@darlean/utils';
import { IInstanceContainer } from './instances';
import { IActorPlacement, IPortal } from './remoteinvocation';
import { IPersistence, IVolatileTimer } from './various';

/**
 * Options that specify how an actor type should be registered.
 */
export interface IActorRegistrationOptions<T extends object> {
    /**
     * The actor type. To avoid name collisions, it is recommended to prefix the actual type
     * with the 'inverse domain', for example: `com.example.MyActor`.
     */
    type: string;

    /**
     * Indicates whether the actor is a singular (only one concurrent instance is allowed within
     * the cluster) or a multiplar (more than one concurrent instances are allowed).
     */
    kind: 'singular' | 'multiplar';

    /**
     * Factory function that creates a new actor instance. The provided `context` provides access to
     * useful information like the id of the to-be-created actor and persistency service.
     *
     * Can be optional, because client applications may just register an actor to specify the {@link apps}
     * property without being able to create new instances themselves.
     *
     * @see IActorCreateContext
     */
    creator?: (context: IActorCreateContext) => T;

    /**
     * Optional container instance that hosts the created instances for this type. When omitted,
     * an {@link InstanceContainer} is automatically created.
     */
    container?: IInstanceContainer<T>;

    /**
     * The maximum number of instances in the container.
     */
    capacity?: number;

    /**
     * Optional placement options.
     */
    placement?: IActorPlacement;

    /**
     * When present, the list of app-id's on which this actor can run.
     *
     * This is only required when no actor directory is being used.
     */
    apps?: string[];
}

/**
 * Provides useful context to the {@link IActorRegistrationOptions.creater} factory function that creates
 * new actor instances.
 */
export interface IActorCreateContext {
    /**
     * The id of the actor that is to be created.
     */
    id: string[];

    /**
     * Acquire a persistence interface that can be used by the created actor to load and persist its state.
     * @param specifiers An optional list of specifiers that instruct the persistence service which underlying
     * persistence compartment to use.
     * @remarks Normally, only one specifier is present. It should describe the functional role of the data being
     * persisted, with the convention of using dot-notation with lowercase characters. For example:
     * * `oracle.knowledge.facts` to store the knowledge facts of an all-knowing oracle application
     * * `shoppingcart.current` to store the state of shopping carts on which a user is still working
     * * `shoppingcart.archive` to store the state of shopping carts that have been fully processed
     *
     * It is possible to define multiple specifiers. This is intended as a way to migrate from one specifier
     * to the other. The actors can already include the new and the old specifier (in that order). Details
     * are still to be worked out.
     */
    persistence(specifiers?: string[]): IPersistence<unknown>;

    /**
     * The portal interface that gives the created actor access to other actors within the cluster.
     *
     * It is recommended practice that the creator function derives the strictest sub-portal that
     * is useful to the created actor (using {@link IPortal.typed}, {@link ITypedPortal.prefix} and
     * {@link IPortal.prefix}) and passes this strictest sub-portal via the constructor to the newly
     * created actor instance.
     */
    portal: IPortal;

    /**
     * The time interface that gives the created actor access to the current time. It also allows scheduling
     * of events, although it is generally better to use {@link IActorCreateContext.newVolatileTimer} for that.
     */
    time: ITime;

    /**
     * Gives the created actor the ability to schedule volatile timers that automatically stop when the actor
     * is deactivated.
     */
    newVolatileTimer(): IVolatileTimer;
}

export interface IActorSuite {
    getRegistrationOptions(): IActorRegistrationOptions<object>[];
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

    protected addItem(item: IActorOrSuite) {
        if (item.actor) {
            this.addActor(item.actor);
        }

        if (item.suite) {
            this.addSuite(item.suite);
        }
    }
}

/**
 * Holds actor registration options or a suite.
 */
export interface IActorOrSuite {
    actor?: IActorRegistrationOptions<object>;
    suite?: IActorSuite;
}
