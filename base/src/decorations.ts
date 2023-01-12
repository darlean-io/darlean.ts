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
