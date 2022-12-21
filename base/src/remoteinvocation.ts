import { IInvokeOptions, IInvokeResult } from './shared';

export const ERROR_PARAMETER_REDIRECT_DESTINATION = 'REDIRECT_DESTINATION';

export const ERROR_CODE_NO_RECEIVERS_AVAILABLE = 'NO_RECEIVERS_AVAILABLE';

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
     */
    retrieve<T extends object>(type: string, id: string[]): T;

    /**
     * Returns a new portal that retrieves actors from the current portal that have a specified type
     * and an optional id prefix. Callers to the {@link ITypedPortal.retrieve} method of the returned
     * {@link ITypedPortal} only have to include the remaining id parts.
     * @param type The type of the actors that the sub portal can retrieve
     * @param idPrefix An optial prefix of the id of actors to be retrieved by the sub portal.
     */
    sub<T extends object>(type: string, idPrefix?: string[]): ITypedPortal<T>;
}

/**
 * Allows a caller to retrieve a persistent proxy to a remote actor of a certain type. That is, even when the remote
 * actor is reincarnating, the proxy should still point to that same actor.
 */
export interface ITypedPortal<T> {
    /**
     * Retrieves a persistent local proxy to a remote actor of the specified id.
     * @param id The id of the remote actor for which a proxy is to be obtained
     * @returns A proxy object of type T that internally takes care of all the networking and
     * other complexity of invoking the remote actor.
     */
    retrieve(id: string[]): T;

    /**
     * Returns a new portal that retrieves actors from the current portal that have a specified id prefix.
     * Callers to the {@link ITypedPortal.retrieve} method of the returned
     * {@link ITypedPortal} only have to include the remaining id parts.
     * @param idPrefix The prefix of the id of actors to be retrieved by the sub portal.
     */
    sub(idPrefix: string[]): ITypedPortal<T>;
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
}

/**
 * Represents a mechanism of remotely invoking actor actions.
 */
export interface IRemote {
    /**
     * Invoke a remote action
     * @param options The options that specify what to invoke
     * @returns The result of the invocation, which can either be erroneous ({@link shared.IInvokeResult.errorCode} is filled in)
     * or successful (otherwise, {@link shared.IInvokeResult.content} is filled in).
     * @remarks
     * `invoke` should *never* throw an error. Errors must always be caught internally and the {@link shared.IInvokeResult.errorCode}
     * must be filled accordingly.
     *
     * Errors that occur *within the user code of the remote actor* are not considered erroneous. Such user errors
     * are reported in the {@link shared.IActorCallResponse.error} field of the {@link shared.IActorCallResponse} object
     * in {@link shared.IInvokeResult.content}.
     */
    invoke(options: IInvokeOptions): Promise<IInvokeResult>;
}

/**
 * Waits a certain amount. Returns false when backing off should be
 * stopped, true otherwise.
 */
export type BackOffFunction = () => Promise<boolean>;

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
