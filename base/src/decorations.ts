import { IInstancePrototype } from '.';

/**
 * Defines the field that can be set on a method of an actor object to instruct Darlean
 * on how to handle the method (like which kind of locking to apply).
 */
export interface IActionDecorable {
    _darlean_options?: IActionDecoration;
}

/**
 * Options that can be used to decorate an action method via {@link @action}, {@link @activator}, {@link @deactivator} and 
 * {@link @timer}.
 */
export interface IActionDecoration {
    /**
     * The name of the action via which other actors can invoke the action. When omitted, the name of the method is used as action name.
     */
    name?: string;
    /**
     * The locking method for this action. When omitted, the locking method for the actor is used. When that actor decoration also does
     * not explicitly define the locking, a locking of `'exclusive'` is used for regular actors, and a locking of `'shared'` is used for
     * service actors.
     *
     * * For *exclusive locking*, the framework ensures that only one action method is executed at a time per actor instance (with the exception
     *   of reentrant calls for the same call tree).
     * * For *shared* locking*, multiple actions that are also 'shared' can be active at the same time per actor instance, but not at the same time
     *   as an action that is 'exclusive'.
     * * When locking is set to `'none'` for an action, it can always be invoked, regardless of other shared or exclusive actions currently
     *   being performed or not. This option should only be used in very special use cases where the other locking modes are not sufficient.
     */
    locking?: 'shared' | 'exclusive' | 'none';
    /**
     * An optional description for the action that can, for example, be displayed in the Darlean control panel for informative purposes.
     */
    description?: string;

    kind?: 'action' | 'activator' | 'deactivator';
}

/**
 * Decoration options for regular actors and service actors.
 *
 */
export interface IActorDecoration {
    /**
     * Name of the actor (aka the actorType) by which other actors can reference the actor type.
     */
    name?: string;

    /**
     * Default locking mode for the actions of this actor. When not specified, regular actors
     * (when `@actor` is used as decorator) have default locking mode `'exclusive'`, whereas
     * service actors (with `@service` as decorator) have `'shared'` locking by default.
     */
    locking?: 'shared' | 'exclusive';

    /**
     * An optional list of actor type names that this actor needs to be available for proper
     * operation (incuding deactivation). When the cluster is being shut down, the framework
     * tries to repect these dependencies so that all actors can be disabled properly.
     */
    //dependencies?: string[];

    /**
     * When True, a preconfigured list of very basic dependencies is automatically added to the
     * actors list of dependencies. This includes the Darlean runtime and persistence services
     * so that actors can always properly store their state upon deactivation.
     */
    //inheritDefaultDependencies?: boolean;

    /**
     * Optional index that indocates which field of the actor id contains the name of the node
     * on which it should be running.
     *
     * When present, the actor is forced to run exactly on the node specified by the corresponding
     * id field. The actor will never run on another node, even not when the specified node is not available.
     *
     * When the appBindIndex is negative, it is counted from the end of the actor id parts (so, a
     * value of -1 means the rightmost id part, and so on).
     *
     * By default, appBindIndex is not set, which allows dynamic actor placement (which usually is a good
     * thing considering it is a conscious choice to use a *virtual* actor framework instead of a regular
     * actor framework).
     */
    appBindIndex?: number;

    /**
     * Optional callback that is invoked when the Darlean application is started. See
     * [[IBaseActorFactoryOptions.onAppStart]] for more info and caveats.
     */
    //onAppStart?: (runtime: IRuntime) => Promise<void>;

    /**
     * Optional callback that is invoked when the Darlean application is stopping. See
     * [[IBaseActorFactoryOptions.onAppStop]] for more info and caveats.
     */
    //onAppStop?: (runtime: IRuntime) => Promise<void>;

    // placement?: Placement[];

    runLevel?: number;
}

/**
 * Decorator for a class that implements a virtual actor of which no more than one simultaneous instance
 * is allowed be active at any moment within the entire Darlean cluster. 
 * 
 * Standard use:
 * ```ts
 * @actor({name: 'mynamespace.MyActor'})
 * export class MyActor {
 *    ...
 * }
 * ```
 * @see {@link IActorDecoration} for the list of options that can be provided. 
 * @see {@link service|@service} for how to decorate a *service actor* that does not have the restriction of only
 * allowing one active simultaneous instance.
 */
export function actor(config: IActorDecoration = {}) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        _actorOrServiceDecorator(config, true, constructor);
    };
}

/**
 * Decorator for a service actor class of which more than one simultaneous instance can be active within the
 * Darlean cluster.
 * 
 * Service actors are typically used to hide the implementation details that regular virtual actors provide. This makes
 * it possible to change the virtual actor implementation (like renaming virtual actor types, splitting them up or combining
 * them, and/or changing how their id's are formed).
 *
 * Standard use:
 * ```ts
 * @service({name: 'mynamespace.MyService'})
 * export class MyService {
 *    ...
 * }
 * ```
 * @see {@link IActorDecoration} for the list of options that can be provided.
 * @see {@link actor | @actor} for how to decorate a regular virtual actor that has the restriction of only allowing
 * one simultaneous instance active at any moment.
 */
export function service(config: IActorDecoration = {}) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        _actorOrServiceDecorator(config, false, constructor);
    };
}

/**
 * Shared code for `actor` and `service` decorators.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function _actorOrServiceDecorator(config: IActorDecoration, singleton: boolean, constr: Function): void {
    const target = constr.prototype;
    const casted = target as IInstancePrototype;
    casted._darlean_multiplicity = singleton ? 'single' : 'multiple';
    casted._darlean_default_locking = config.locking || 'exclusive';
    casted._darlean_app_bind_index = config.appBindIndex;
}

/**
 * Decorator for an action method.
 *
 * When the method name already matches with the action name, and no additional opions are required:
 * ```ts
 * @action()
 * public myActor(...) {}
 * ```
 *
 * When the method name does not match with the action name, and/or when additional options are required:
 * ```ts
 * @action({name: 'myAction', locking: 'shared'})
 * public myActorFunction(...) {}
 * ```
 *
 * For a list of options, see [[IActionDecoration]].
 *
 * @decorator
 */
export function action(config?: IActionDecoration) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (prototype: Object, propertyKey: string, descriptor: PropertyDescriptor): void {
        (descriptor.value as IActionDecorable)._darlean_options = {
            kind: 'action',
            locking: config?.locking
        } as IActionDecoration;
    };
}

/**
 * Decorator for a volatile timer method.
 *
 * @decorator
 */
export function timer(config?: IActionDecoration) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (prototype: Object, propertyKey: string, descriptor: PropertyDescriptor): void {
        (descriptor.value as IActionDecorable)._darlean_options = {
            kind: 'action',
            locking: config?.locking
        } as IActionDecoration;
    };
}

/**
 * Decorator for a deactivate method that can be used to provide additional configuration to
 * the deactivate method.
 * 
 * @remarks This decorator should only be used when the actor class does not implement the standard 
 * {@link IDeactivatable.deactivate} method, or when it is necessary to change the default options
 * for the standard eactivate method.
 * @decorator
 */
export function deactivator(config?: IActionDecoration) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (prototype: Object, propertyKey: string, descriptor: PropertyDescriptor): void {
        (descriptor.value as IActionDecorable)._darlean_options = {
            kind: 'deactivator',
            locking: config?.locking || 'exclusive'
        } as IActionDecoration;
    };
}

/**
 * Decorator for an activate method that can be used to provide additional configuration to
 * the activate method.
 * 
 * @remarks This decorator should only be used when the actor class does not implement the standard 
 * {@link IActivatable.activate} method, or when it is necessary to change the default options
 * for the standard eactivate method.
 * @decorator
 */
export function activator(config?: IActionDecoration) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (prototype: Object, propertyKey: string, descriptor: PropertyDescriptor): void {
        (descriptor.value as IActionDecorable)._darlean_options = {
            kind: 'activator',
            locking: config?.locking || 'exclusive'
        } as IActionDecoration;
    };
}
