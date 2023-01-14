import { Aborter } from '@darlean/utils';
import { IInvokeOptions, IInvokeResult } from './shared';

export const FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION = 'REDIRECT_DESTINATION';

export const FRAMEWORK_ERROR_NO_RECEIVERS_AVAILABLE = 'NO_RECEIVERS_AVAILABLE';
export const FRAMEWORK_ERROR_INVOKE_ERROR = 'INVOKE_ERROR';
export const FRAMEWORK_ERROR_UNKNOWN_ACTION = 'UNKNOWN_ACTION';
export const FRAMEWORK_ERROR_UNKNOWN_ACTOR_TYPE = 'UNKNOWN_ACTOR_TYPE';
export const FRAMEWORK_ERROR_ACTOR_LOCK_FAILED = 'ACTOR_LOCK_FAILED';
export const FRAMEWORK_ERROR_FINALIZING = 'FINALIZING';

/**
 * Indicates that long running actions on an object that implements IAbortable can be aborted
 * before the long running operation is finished. For that to work, the calling code must create a new {@link Aborter} instance and
 * pair it with the object via {@link IAbortable.aborter} just before invoking the long running action method.
 * 
 * @remarks
 * * It depends on the implementation of the object that implements IAbortable whether the aborted method
 *   throws an error or just returns with a regular or special value.
 * * The aborter set via {@link IAbortable.aborter} only applies to the *first* subsequent action method call, so it can
 *   only be used to abort the *first* action method invoked after invoking {@link IAbortable.aborter}.
 * 
 * Example:
 * ```ts
 * const aborter = new Aborter();
 * setTimeout( () => aborter.abort(), 1000 );
 * myObject.aborter(aborter);
 * await myObject.doSomethingTimeConsuming();
 * ```
 */
export interface IAbortable {
    aborter(value: Aborter): void;
}

/**
 * Allows a caller to retrieve a persistent proxy to a remote actor. That is, even when the remote
 * actor is reincarnating, the proxy should still point to that same actor.
 */
export interface IPortal {
    /**
     * Retrieves a persistent local proxy to a remote actor of the specified type and id.
     * @param type The type of the remote actor for which a proxy is to be obtained
     * @param id The id of the remote actor for which a proxy is to be obtained
     * @returns A proxy object of type T that internally takes care of all the networking and
     * other complexity of invoking the remote actor.
     * @remarks 
     * * Even when the requested type is not known to the system, the call returns a valid
     *   proxy object. Any errors resulting from the type not being known to the system are thrown when
     *   actions are actually being performed on the returned proxy. This behaviour makes it possible to already initialize
     *   actors with their proper portals at application startup (dependency injection) when the rest of the
     *   system is not yet up.
     * * The returned proxy implements {@link IAbortable} which means that long-running actions can be aborted
     *   by first (just before invoking the long running action method) invoking {@link IAbortable.aborter} on
     *   the proxy with a freshly created {@link Aborter} instance as argument.
     */
    retrieve<T extends object>(type: string, id: string[]): T & IAbortable;

    /**
     * Returns a new portal that retrieves actors from the current portal that have a specified type.
     * @param type The type of the actors that the sub portal can retrieve
     * @remarks Even when the requested type is not known to the system, the call returns a valid
     * {@link ITypedPortal} instance. Any errors resulting from the type not being known to the system are thrown when
     * actions are actually being performed on the returned portal. This behaviour makes it possible to already initialize
     * actors with their proper portals at application startup (dependency injection) when the rest of the
     * system is not yet up.
     */
    typed<T extends object>(type: string): ITypedPortal<T>;

    /**
     * Returns a new portal that retrieves actors from the current portal that have a specified id prefix.
     * Callers to the {@link IPortal.retrieve} method of the returned
     * {@link IPortal} only have to include the remaining id parts.
     * @param idPrefix The prefix of the id of actors to be retrieved by the sub portal.
     */
    prefix(idPrefix: string[]): IPortal;
}

/**
 * Allows a caller to retrieve a persistent proxy to a remote actor of a certain type. That is, even when the remote
 * actor is reincarnating, the proxy should still point to that same actor.
 *
 * A typed portal is usually obtained by calling {@link IPortal.typed} on a regular {@link IPortal}.
 */
export interface ITypedPortal<T> {
    /**
     * Retrieves a persistent local proxy to a remote actor of the specified id.
     * @param id The id of the remote actor for which a proxy is to be obtained
     * @returns A proxy object of type T that internally takes care of all the networking and
     * other complexity of invoking the remote actor.
     * @remarks
     *   The returned proxy implements {@link IAbortable} which means that long-running actions can be aborted
     *   by first (just before invoking the long running action method) invoking {@link IAbortable.aborter} on
     *   the proxy with a freshly created {@link Aborter} instance as argument.
     */
    retrieve(id: string[]): T & IAbortable;

    /**
     * Returns a new portal that retrieves actors from the current portal that have a specified id prefix.
     * Callers to the {@link ITypedPortal.retrieve} method of the returned
     * {@link ITypedPortal} only have to include the remaining id parts.
     * @param idPrefix The prefix of the id of actors to be retrieved by the sub portal.
     */
    prefix(idPrefix: string[]): ITypedPortal<T>;
}

/**
 * Contains information about how a certain actor is to be placed: whether it should be
 * bound to a certain application, or not.
 */
export interface IActorPlacement {
    /**
     * The version of the actor placement. Newly received actor placement information only
     * replaces current placement information when the version string of the new info
     * is lexicographically greater than the version of the current info.
     */
    version: string;

    /**
     * The index number (0-based) of the id field of an actor that contains the name of the
     * application the actor must be running or. A negative number is relative to the last
     * id part.
     */
    bindIdx?: number;

    /**
     * When set to `true`, indicates that clients should try the same application on
     * subsequent action requests. This is a performance optimization for virtual actors
     * because it saves a lookup in the actor lock for subsequent calls.
     */
    sticky?: boolean;
}

export interface IInvokeInterruptor {
    interrupt(): void;
}


/**
 * Represents a mechanism of remotely invoking actor actions.
 */
export interface IRemote {
    /**
     * Invoke a remote action
     * @param options The options that specify what to invoke
     * @returns The result of the invocation, which can either be erroneous ({@link IInvokeResult.errorCode} is filled in)
     * or successful (otherwise, {@link IInvokeResult.content} is filled in).
     * @remarks
     * `invoke` should *never* throw an error. Errors must always be caught internally and the {@link IInvokeResult.errorCode}
     * must be filled accordingly.
     *
     * Errors that occur *within the user code of the remote actor* are not considered erroneous. Such user errors
     * are reported in the {@link IActorCallResponse.error} field of the {@link IActorCallResponse} object
     * in {@link IInvokeResult.content}.
     */
    invoke(options: IInvokeOptions): Promise<IInvokeResult>;
}

/**
 * Waits a certain amount. Returns false when backing off should be
 * stopped, true otherwise.
 */
export type BackOffFunction = (aborter?: Aborter) => Promise<boolean>;

/**
 * Backoff mechanism that repeatedly waits a certain amount of time. A new
 * session is started by means of {@link begin}, which returns a {@link BackOffFunction}
 * that can be invoked multiple times until it returns `false`. Depending on the
 * implementation, the async backoff function will wait for a certain amount of time.
 */
export interface IBackOff {
    /**
     * Begin a new backoff session. The returned backoff function can be invoked
     * multiple times, until it returns 'false'.
     * @param maxDurationMS When specified, the maximum amount of milliseconds the
     * total backoff may take.
     */
    begin(maxDurationMS?: number): BackOffFunction;
}
