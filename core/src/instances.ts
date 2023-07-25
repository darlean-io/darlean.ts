/* eslint-disable @typescript-eslint/ban-types */
/**
 * Contains types and functions to define (implement) and call actor instances locally (within
 * the same process).
 *
 * Actors are just plain classes with public async action methods, decorated with {@link action|@action}. They can
 * optionally implement {@link IActivatable} by adding an async {@link IActivatable.activate} method
 * and/or {@link IDeactivatable} by adding an async {@link IDeactivatable.deactivate} method.
 *
 * Although it is possible to instantiate and/or invoke such an actor instance directly by calling
 * its methods, the locking and automatic activation/deactivation that normally takes place is
 * then bypassed. Therefore, it is not recommended to directly create and invoke actor instances
 * (except, for example, for unit tests that do not require this additional behaviour).
 *
 * The prefered way of invoking actor instances is by means of an {@link InstanceWrapper}, either
 * directly by creating a new {@link InstanceWrapper} around a certain actor instance, or by creating
 * an {@link InstanceContainer} with an {@link InstanceCreator} that creates new instances
 * on the fly (and also deactivates instances when the configured container capacity is exceeded).
 *
 * Both {@link InstanceWrapper} and {@link InstanceContainer} respect the configured locking and
 * activation/deactivation mechanisms (by means of the {@link action|@action}, {@link actor|@action}
 * and {@link service|@service} decorators).
 *
 * @packageDocumentation
 */

import { currentScope, deeper, Mutex, SharedExclusiveLock } from '@darlean/utils';
import { idToText } from './various';
import { normalizeActionName, normalizeActorType } from './shared';
import { EventEmitter } from 'events';
import { ITime } from '@darlean/utils';
import {
    ApplicationError,
    APPLICATION_ERROR_UNEXPECTED_ERROR,
    FrameworkError,
    FRAMEWORK_ERROR_FINALIZING,
    FRAMEWORK_ERROR_INCORRECT_STATE,
    FRAMEWORK_ERROR_UNKNOWN_ACTION,
    FRAMEWORK_ERROR_UNKNOWN_ACTOR_TYPE,
    IActionDecorable,
    IActionDecoration,
    IActionError,
    IInstanceContainer,
    IInstancePrototype,
    IInstanceWrapper,
    IMultiTypeInstanceContainer,
    InstanceCreator,
    toApplicationError,
    FRAMEWORK_ERROR_MIGRATION_ERROR
} from '@darlean/base';
import { IVolatileTimer, IVolatileTimerHandle } from '@darlean/base';
import { IAcquiredActorLock, IActorLock } from './distributedactorlock';

const ACTIVATOR = 'ACTIVATOR';
const DEACTIVATOR = 'DEACTIVATOR';

const ACTIVATE_METHOD = 'activate';
const DEACTIVATE_METHOD = 'deactivate';

export const FRAMEWORK_ERROR_APPLICATION_ERROR = 'APPLICATION_ERROR';

/**
 * Container for instances of a certain type T. The container acts as a cache
 * for already created instances up to a certain capacity. Instances
 * are removed by means of a LRU policy.
 */
export class InstanceContainer<T extends object> implements IInstanceContainer<T> {
    protected creator: InstanceCreator<T>;
    protected capacity: number;
    protected instances: Map<string, InstanceWrapper<T>>;
    protected callCounter: number;
    protected cleaning: Map<string, boolean>;
    protected finalizing = false;
    protected actorLock?: IActorLock;
    protected actorType: string;

    constructor(actorType: string, creator: InstanceCreator<T>, capacity: number, actorLock?: IActorLock) {
        this.actorType = normalizeActorType(actorType);
        this.creator = creator;
        this.capacity = capacity;
        this.instances = new Map();
        this.cleaning = new Map();
        this.callCounter = 0;
        this.actorLock = actorLock;
    }

    public async delete(id: string[]): Promise<void> {
        const idt = idToText(id);
        return await this.deleteImpl(idt);
    }

    public obtain(id: string[]): T {
        return this.wrapper(id).getProxy();
    }

    /**
     *
     * @param id
     * @returns
     * @throws {@link FrameworkError} when something goes wrong.
     */
    public wrapper(id: string[]): IInstanceWrapper<T> {
        const idt = idToText(id);
        const current = this.instances.get(idt);
        if (current) {
            this.instances.delete(idt);
            this.instances.set(idt, current);
            return current;
        }

        // TODO: Is this correct here? Should we not return a proxy, and should the proxy
        // not throw an error when metods are invoked while finalizing??
        if (this.finalizing) {
            throw new FrameworkError(
                FRAMEWORK_ERROR_FINALIZING,
                'Not allowed to create new instance of [ActorType] because the container is finalizing',
                { ActorType: this.actorType }
            );
        }

        const instanceinfo = this.creator(id);
        const actorLock = this.actorLock;
        const instanceWrapperActorLock: InstanceWrapperActorLock | undefined = actorLock
            ? (onBroken: () => void) => actorLock.acquire([this.actorType, ...id], onBroken)
            : undefined;
        const wrapper = new InstanceWrapper(this.actorType, instanceinfo.instance, instanceWrapperActorLock);
        wrapper?.on('deactivated', () => {
            this.instances.delete(idt);
            this.cleaning.delete(idt);
        });

        if (instanceinfo.afterCreate) {
            instanceinfo.afterCreate(wrapper);
        }

        this.instances.set(idt, wrapper);
        this.cleanup();

        return wrapper;
    }

    public async finalize(): Promise<void> {
        // console.log('Finalizing container', this.actorType);
        this.finalizing = true;
        // Make a copy of this.instances to avoid the deletion operations to have impact on the
        // iterator like missing items. Because finalizing = true, we should not add items anymore
        // to this.instances.
        const keys = Array.from(this.instances.keys());
        for (const instance of keys) {
            await this.deleteImpl(instance);
        }
    }

    protected async deleteImpl(id: string): Promise<void> {
        const instance = this.instances.get(id);
        if (instance) {
            // console.log('Deleting instance', this.actorType, id);
            try {
                await instance.deactivate();
                // console.log('Deleted instance', this.actorType, id);
            } catch (e) {
                console.log('Error deleting instance', this.actorType, id, e);
            }
        }
    }

    protected cleanup(): void {
        if (this.instances.size - this.cleaning.size > this.capacity) {
            for (const id of this.instances.keys()) {
                if (this.instances.size - this.cleaning.size <= this.capacity) {
                    break;
                }

                if (!this.cleaning.has(id)) {
                    this.cleaning.set(id, true);
                    setImmediate(async () => {
                        try {
                            await this.deleteImpl(id);
                        } catch (e) {
                            console.log('Error during finalizing', e);
                        }
                    });
                }
            }
        }
    }
}

/**
 * Implementation of {@link IMultiTypeInstanceContainer}.
 */
export class MultiTypeInstanceContainer implements IMultiTypeInstanceContainer {
    protected containers: Map<string, IInstanceContainer<object>>;
    protected finalizing = false;

    constructor() {
        this.containers = new Map();
    }

    public register<T extends object>(type: string, container: IInstanceContainer<T>) {
        if (this.finalizing) {
            throw new Error('Registering a new container is not allowed while finalizing');
        }

        this.containers.set(normalizeActorType(type), container);
    }

    /**
     *
     * @param type
     * @param id
     * @returns
     * @throws {@link FrameworkError} with code {@link FRAMEWORK_ERROR_UNKNOWN_ACTOR_TYPE}
     * when the actor type is unknown
     */
    public obtain<T extends object>(type: string, id: string[]): T {
        const container = this.containers.get(type) as IInstanceContainer<T>;
        if (container) {
            return container.obtain(id);
        } else {
            throw new FrameworkError(FRAMEWORK_ERROR_UNKNOWN_ACTOR_TYPE, 'Actor type [ActorType] is unknown', {
                ActorType: type
            });
        }
    }

    public async finalize(): Promise<void> {
        if (this.finalizing) {
            return;
        }

        this.finalizing = true;

        const containers = Array.from(this.containers.values()).reverse();
        for (const container of containers) {
            await container.finalize();
        }
    }
}

export type InstanceWrapperActorLock = (onBroken: () => void) => Promise<IAcquiredActorLock>;

/**
 * Wrapper around an instance of type T. The wrapper understands class and method
 * decorations, and applies the proper locking and activation/deactivation of the
 * instance.
 */
export class InstanceWrapper<T extends object> extends EventEmitter implements IInstanceWrapper<T> {
    protected proxy: T;
    protected instance: T;
    protected revoke: () => void;
    protected state: 'created' | 'activating' | 'active' | 'deactivating' | 'inactive';
    protected lock: SharedExclusiveLock;
    protected callCounter: number;
    protected methods: Map<string, Function>;
    protected activeContinuation?: () => void;
    protected actorLock?: InstanceWrapperActorLock;
    protected lifecycleMutex: Mutex<void>;
    protected acquiredActorLock?: IAcquiredActorLock;
    protected actorType: string;

    /**
     * Creates a new wrapper around the provided instance of type T.
     * @param instance The instance around which the wrapper should be created.
     * @throws {@link FrameworkError} with code {@link FRAMEWORK_ERROR_UNKNOWN_ACTION}
     * when methods on this object are invokes that do not exist in the underlying instance.
     */
    public constructor(actorType: string, instance: T, actorLock: InstanceWrapperActorLock | undefined) {
        super();
        this.actorType = actorType;
        this.instance = instance;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.state = 'created';
        this.actorLock = actorLock;
        this.lifecycleMutex = new Mutex();

        this.methods = this.obtainMethods();

        const p = Proxy.revocable(instance, {
            get: (target, prop) => {
                const name = normalizeActionName(prop.toString());
                const func = this.methods.get(name);
                if (func) {
                    return function (...args: unknown[]) {
                        return self.handleCall(func, name, args);
                    };
                } else {
                    throw new FrameworkError(
                        FRAMEWORK_ERROR_UNKNOWN_ACTION,
                        'Action [ActionName] does not exist on [ActorType]',
                        { ActorType: this.actorType, ActionName: name }
                    );
                }
            }
        });
        this.proxy = p.proxy;
        this.revoke = p.revoke;
        this.lock = new SharedExclusiveLock('exclusive');
        this.callCounter = 0;
    }

    /**
     * Performs deactivation of the underlying instance (which includes invoking the {@link IDeactivatable.deactivate})
     * method when it exists and waiting for it to complete) and then invalidates the internal proxy (that could have previously been
     * obtained via {@link getProxy}), so that all future requests to the proxy raise an exception. Once deactivated, deactivation cannot be undone.
     */
    public async deactivate(skipMutex = false): Promise<void> {
        await deeper('io.darlean.instances.deactivate').perform(async () => {
            if (!skipMutex) {
                deeper('io.darlean.instances.try-acquire-lifecycle-mutex').performSync(() => this.lifecycleMutex.tryAcquire()) ||
                    (await deeper('io.darlean.instances.acquire-lifecycle-mutex').perform(() => this.lifecycleMutex.acquire()));
            }
            try {
                if (this.state === 'created') {
                    return;
                }

                if (this.state !== 'inactive') {
                    this.state = 'deactivating';

                    try {
                        const func = this.methods.get(DEACTIVATOR);
                        await this.handleCall(func, DEACTIVATOR, [], { locking: 'exclusive' }, undefined, true);
                    } finally {
                        this.revoke();
                        this.state = 'inactive';
                        await this.releaseActorLock();
                        this.emit('deactivated');
                    }
                }
            } finally {
                if (!skipMutex) {
                    this.lifecycleMutex.release();
                }
            }
        });
    }

    /**
     *
     * @returns Returns a reference to the proxy that can be used to invoke methods on the underlying
     * instance until {@link deactivate} is invoked. After that, the proxy does not invoke the underlying
     * instance anymore but only throws exceptions.
     */
    public getProxy(): T {
        return this.proxy;
    }

    public getInstance(): T {
        return this.instance;
    }

    public async invoke(method: Function | string | undefined, args: unknown): Promise<unknown> {
        if (typeof method === 'string') {
            const name = normalizeActionName(method);
            method = this.methods.get(name);
            if (!method) {
                throw new FrameworkError(FRAMEWORK_ERROR_UNKNOWN_ACTION, 'Action [ActionName] does not exist on [ActorType]', {
                    ActorType: this.actorType,
                    ActionName: name
                });
            }
        }
        return await this.handleCall(method, typeof method === 'string' ? method : method?.name ?? '', args);
    }

    protected async handleCall(
        method: Function | undefined,
        actionName: string,
        args: unknown,
        defaultConfig?: IActionDecoration,
        conditional?: () => boolean,
        shortCircuit = false
    ): Promise<unknown> {
        return await deeper('io.darlean.instances.handle-call', `${this.actorType}::${method?.name}`).perform(async () => {
            const config = (method as IActionDecorable)?._darlean_options;

            if (!config && !defaultConfig && method !== undefined) {
                // Only accept calls to methods that are explicitly marked to be an action. This is
                // a security measure that stops unintended access to methods that are not intended
                // to be invoked as action.
                throw new Error(`Method [${method?.name}] is not an action (is it properly decorated with @action?)`);
            }

            const locking = config?.locking ?? defaultConfig?.locking ?? 'exclusive';

            const callId = this.callCounter.toString();
            this.callCounter++;

            if (!shortCircuit) {
                deeper('io.darlean.instances.try-ensure-active').performSync(() => this.tryEnsureActive()) ||
                    (await deeper('io.darlean.instances.ensure-active').perform(() => this.ensureActive()));
            }

            deeper('io.darlean.instances.try-acquire-local-lock').performSync(() => this.tryAcquireLocalLock(locking, callId)) ||
                (await deeper('io.darlean.instances.acquire-local-lock').perform(() => this.acquireLocalLock(locking, callId)));

            try {
                if (method) {
                    if (!conditional || conditional()) {
                        // Invoke the actual method on the underlying instance
                        const scope =
                            actionName === ACTIVATOR
                                ? 'actor.invoke-activator'
                                : actionName === DEACTIVATOR
                                ? 'actor.invoke-deactivator'
                                : 'actor.invoke-action';
                        return await deeper(scope, `${this.actorType}::${actionName}`).perform(() =>
                            method.apply(this.instance, args)
                        );
                    }
                }
            } catch (e) {
                if (e instanceof FrameworkError) {
                    // When a migration error occurs within the application code, we must literally forward it as
                    // framework error (otherwise receiving side will not properly perform a retry on a modern node).
                    // Because migration errors in remote invocations within the method call are already converted to
                    // framework errors with code FRAMEWORK_ERROR_INVOKE_ERROR (see RemotePortal.retrieve), we have no
                    // risk of accidentally reporting such false migration errors here.
                    if (e.code === FRAMEWORK_ERROR_MIGRATION_ERROR) {
                        throw e;
                    }
                }
                throw toApplicationError(e);
            } finally {
                this.releaseLocalLock(locking, callId);
            }
        });
    }

    protected tryEnsureActive(): boolean {
        if (!this.lifecycleMutex.tryAcquire()) {
            return false;
        }

        try {
            if (this.state === 'active') {
                return true;
            }

            return false;
        } finally {
            this.lifecycleMutex.release();
        }
    }

    protected async ensureActive(): Promise<void> {
        deeper('io.darlean.instances.try-acquire-lifecycle-mutex').performSync(() => this.lifecycleMutex.tryAcquire()) ||
            (await deeper('io.darlean.instances.acquire-lifecycle-mutex').perform(() => this.lifecycleMutex.acquire()));
        try {
            if (this.state === 'created') {
                this.state = 'activating';

                try {
                    deeper('io.darlean.instances.try-ensure-actor-lock').performSync(() => this.tryEnsureActorLock()) ||
                        (await deeper('io.darlean.instances.ensure-actor-lock').perform(() => this.ensureActorLock()));

                    const func = this.methods.get(ACTIVATOR);

                    if (func) {
                        await this.handleCall(func, ACTIVATOR, [], { locking: 'exclusive' }, undefined, true);
                    }

                    this.state = 'active';
                } catch (e) {
                    currentScope().error('Error during activate: [Error]', () => ({ Error: e }));
                    await this.deactivate(true);
                    throw e;
                }
            }

            if (this.state === 'inactive') {
                // TODO Move this code to perform_call because it first has to acquire action lock, and in between,
                // state may have been changed
                throw new FrameworkError(
                    FRAMEWORK_ERROR_INCORRECT_STATE,
                    'It is not allowed to execute an action when the state is [State]',
                    {
                        State: this.state
                    }
                );
            }
        } finally {
            deeper('io.darlean.instances.release-lifecycle-mutex').performSync(() => this.lifecycleMutex.release());
        }
    }

    protected tryEnsureActorLock(): boolean {
        // Assume we are already in the lifecycleLock
        const actorLock = this.actorLock;
        if (!actorLock) {
            return true;
        }

        if (this.acquiredActorLock) {
            return true;
        }

        if (!this.actorLock) {
            throw new Error('No actor lock available, instance likely to be deactivated');
        }

        return false;
    }

    protected async ensureActorLock() {
        // Assume we are already in the lifecycleLock
        if (this.tryEnsureActorLock()) {
            return;
        }

        const actorLock = this.actorLock;
        if (actorLock) {
            this.acquiredActorLock = await actorLock(() => {
                this.actorLock = undefined;
                setImmediate(async () => {
                    try {
                        // Note: Deactivate will release the obtained action lock (we do not have to do that fro here).
                        await this.deactivate();
                    } catch (e) {
                        currentScope().info(
                            'Error during deactivating actor of type [ActorType] because the actor lock was broken: [Error]',
                            () => ({
                                Error: e,
                                ActorType: this.actorType
                            })
                        );
                    }
                });
            });
        }
    }

    protected async releaseActorLock() {
        // Assume we are already in the lifecycle mutex
        const acquiredActorLock = this.acquiredActorLock;
        if (!acquiredActorLock) {
            return;
        }
        this.acquiredActorLock = undefined;
        this.actorLock = undefined;
        try {
            await acquiredActorLock.release();
        } catch (e) {
            currentScope().info('Error during release of actor lock for an instance of type [ActorType]: [Error]', () => ({
                Error: e,
                ActorType: this.actorType
            }));
        }
    }

    protected tryAcquireLocalLock(locking: 'none' | 'shared' | 'exclusive', callId: string): boolean {
        if (locking === 'shared') {
            return this.lock.tryBeginShared(callId);
        } else if (locking === 'exclusive') {
            return this.lock.tryBeginExclusive(callId);
        } else {
            return true;
        }
    }

    protected async acquireLocalLock(locking: 'none' | 'shared' | 'exclusive', callId: string): Promise<void> {
        if (locking === 'shared') {
            await this.lock.beginShared(callId);
        } else if (locking === 'exclusive') {
            await this.lock.beginExclusive(callId);
        }
    }

    protected releaseLocalLock(locking: 'none' | 'shared' | 'exclusive', callId: string): void {
        if (locking === 'shared') {
            this.lock.endShared(callId);
        } else if (locking === 'exclusive') {
            this.lock.endExclusive(callId);
        }
    }

    protected obtainMethods(): Map<string, Function> {
        const prototype = Object.getPrototypeOf(this.instance) as IInstancePrototype;
        if (!prototype._darlean_methods) {
            const m = new Map<string, Function>();

            const methodNames = getMethods(prototype);

            for (const methodName of methodNames) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const func = (prototype as any)[methodName] as Function;
                const config = (func as IActionDecorable)._darlean_options as IActionDecoration;
                if (config) {
                    if (config.kind === 'action') {
                        const name = config.name || methodName;
                        const normalized = normalizeActionName(name);
                        m.set(normalized, func);
                    } else if (config.kind === 'activator') {
                        m.set(ACTIVATOR, func);
                    } else if (config.kind === 'deactivator') {
                        m.set(DEACTIVATOR, func);
                    }
                }
            }

            if (!m.has(ACTIVATOR) && methodNames.includes(ACTIVATE_METHOD)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                m.set(ACTIVATOR, (prototype as any)[ACTIVATE_METHOD] as Function);
            }

            if (!m.has(DEACTIVATOR) && methodNames.includes(DEACTIVATE_METHOD)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                m.set(DEACTIVATOR, (prototype as any)[DEACTIVATE_METHOD] as Function);
            }

            prototype._darlean_methods = m;
            return m;
        }
        return prototype._darlean_methods;
    }
}

export class VolatileTimer<T extends object> implements IVolatileTimer {
    protected wrapper?: IInstanceWrapper<T>;
    protected time: ITime;

    constructor(time: ITime, wrapper?: IInstanceWrapper<T>) {
        this.time = time;
        this.wrapper = wrapper;
    }

    public setWrapper(wrapper: IInstanceWrapper<T>) {
        this.wrapper = wrapper;
    }

    public once(handler: Function, delay: number, args?: unknown): IVolatileTimerHandle {
        return this.repeat(handler, 0, delay, 0, args);
    }

    repeat(
        handler: Function,
        interval: number,
        delay?: number | undefined,
        repeatCount?: number | undefined,
        args?: unknown
    ): IVolatileTimerHandle {
        const timer = this.time.repeat(
            async () => {
                try {
                    //console.log(`Invoking timer for [${handler.name}] with args [${args}]`, !!this.wrapper);
                    await this.wrapper?.invoke(handler, args ?? []);
                } catch (e) {
                    console.log(`Error in executing volatile timer for [${handler.name}]: ${e}`);
                }
            },
            handler.name,
            interval,
            delay,
            repeatCount
        );

        this.wrapper?.on('deactivated', () => {
            timer.cancel();
        });

        return {
            cancel: () => timer.cancel(),
            pause: (duration) => timer.pause(duration),
            resume: (delay) => timer.resume(delay)
        };
    }
}

export function toFrameworkError(e: unknown) {
    if (e instanceof FrameworkError) {
        return e;
    }
    if (e instanceof ApplicationError) {
        return new FrameworkError(FRAMEWORK_ERROR_APPLICATION_ERROR, e.code, undefined, e.stack, [e], e.message);
    }
    if (typeof e === 'object') {
        const err = e as Error;
        return new FrameworkError(err.name, undefined, undefined, err.stack, undefined, err.message);
    } else if (typeof e === 'string') {
        if (e.includes(' ')) {
            return new FrameworkError(APPLICATION_ERROR_UNEXPECTED_ERROR, e);
        } else {
            return new FrameworkError(e, e);
        }
    } else {
        return new FrameworkError(APPLICATION_ERROR_UNEXPECTED_ERROR, 'Unexpected error');
    }
}

export function toActionError(e: unknown): IActionError {
    if (e instanceof FrameworkError) {
        return e;
    }
    if (e instanceof ApplicationError) {
        return e;
    }
    if (typeof e === 'object') {
        const err = e as Error;
        return new FrameworkError(err.name, undefined, undefined, err.stack, undefined, err.message);
    } else if (typeof e === 'string') {
        if (e.includes(' ')) {
            return new FrameworkError(APPLICATION_ERROR_UNEXPECTED_ERROR, e);
        } else {
            return new FrameworkError(e, e);
        }
    } else {
        return new FrameworkError(APPLICATION_ERROR_UNEXPECTED_ERROR, 'Unexpected error');
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMethods(obj: any) {
    const methods = [];
    do {
        for (const prop of Object.getOwnPropertyNames(obj)) {
            if (obj[prop] instanceof Function) methods.push(prop);
        }
        obj = Object.getPrototypeOf(obj);
    } while (obj !== null);

    return methods;
}
