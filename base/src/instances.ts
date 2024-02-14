import { ApplicationError, FrameworkError } from './shared';

export interface IActivatable {
    activate(): Promise<void>;
}

export interface IDeactivatable {
    deactivate(): Promise<void>;
}

export const APPLICATION_ERROR_FRAMEWORK_ERROR = 'FRAMEWORK_ERROR';
export const APPLICATION_ERROR_UNEXPECTED_ERROR = 'UNEXPECTED_ERROR';

/**
 * Interface used within the framework to add fields to the prototype ('class') of instances.
 */
export interface IInstancePrototype {
    // eslint-disable-next-line @typescript-eslint/ban-types
    _darlean_methods?: Map<string, Function>;
}

/**
 * Function that creates a new instance of type T for a given id.
 */
export type InstanceCreator<T extends object> = (id: string[]) => {
    instance: T;
    afterCreate?: (wrapper: IInstanceWrapper<T>) => void;
};

/**
 * Represents a container from which code can obtain instances by id. Implementations may
 * support recycling of instances (when the container capacity is hit).
 */
export interface IInstanceContainer<T extends object> {
    /**
     * Returns a proxy to an instance with the specified id. This is a
     * convenience wrapper for `wrapper(id).getProxy()`.
     * @param id The id of the actor for which a proxy should be returned
     * @param lazy When true, a new instance is not created, but a framework error is thrown.
     */
    obtain(id: string[], lazy: boolean): T;

    /**
     * Returns an {@link IInstanceWrapper} around an instance with the specified id
     * @param id The id of the actor for which an instance wrapper should be returned.
     * @param lazy When true, a new instance is not created, but a framework error is thrown.
     */
    wrapper(id: string[], lazy: boolean): IInstanceWrapper<T>;

    finalize(): Promise<void>;
}

/**
 * Container for instances of multiple types.
 */
export interface IMultiTypeInstanceContainer {
    obtain<T extends object>(type: string, id: string[], lazy: boolean): T;
    wrapper<T extends object>(type: string, id: string[], lazy: boolean): IInstanceWrapper<T>;
    finalize(): Promise<void>;
}

/**
 * Abstraction of a wrapper around an instance of type T. The wrapper must understand class and method
 * decorations, and must apply the proper locking and activation/deactivation of the
 * instance.
 *
 * To invoke an instance method, first obtain a reference to the instance proxy
 * by means of {@link getProxy}, and then invoke the method on that proxy.
 *
 * @remarks
 * Any exceptions thrown by the underlying instance are converted into {@link ApplicationError}
 * objects and then thrown.
 */
export interface IInstanceWrapper<T extends object> {
    /**
     * Performs deactivation of the underlying instance (which includes invoking the {@link IDeactivatable.deactivate})
     * method when it exists and waiting for it to complete) and then invalidates the internal proxy (that could have previously been
     * obtained via {@link getProxy}), so that all future requests to the proxy raise an exception. Once deactivated, deactivation cannot be undone.
     */
    deactivate(): Promise<void>;

    /**
     * @returns Returns a reference to the proxy that can be used to invoke methods on the underlying
     * instance until {@link deactivate} is invoked. After that, the proxy does not invoke the underlying
     * instance anymore but only throws exceptions.
     */
    getProxy(): T;

    /**
     * @returns a reference to the underlying instance
     */
    getInstance(): T;

    /**
     * Invoke an action method with the provided arguments.
     * @param method The name of the method or the Function of the underlying instance to be invoked.
     * @param args The arguments to the method.
     */
    // eslint-disable-next-line @typescript-eslint/ban-types
    invoke(method: Function | string | undefined, args: unknown): Promise<unknown>;

    on(event: 'deactivated', listener: () => void): this;
}

export function toApplicationError(e: unknown) {
    if (e instanceof ApplicationError) {
        return e;
    }
    if (e instanceof FrameworkError) {
        return new ApplicationError(APPLICATION_ERROR_FRAMEWORK_ERROR, e.code, undefined, e.stack, [e], e.message);
    }
    if (typeof e === 'object') {
        const err = e as Error;
        return new ApplicationError(err.name, undefined, undefined, err.stack, undefined, err.message);
    } else if (typeof e === 'string') {
        if (e.includes(' ')) {
            return new ApplicationError(APPLICATION_ERROR_UNEXPECTED_ERROR, e);
        } else {
            return new ApplicationError(e, e);
        }
    } else {
        return new ApplicationError(APPLICATION_ERROR_UNEXPECTED_ERROR, 'Unexpected error');
    }
}
