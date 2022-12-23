/**
 * This module provides types and methods for working with local actor invocation, that is, invoking of
 * actors that live in the same process as the code that invokes the actor.
 *
 * For local use (that is, when all code and actors live in the same process), it is possible to use {@link LocalPortal}, which
 * is a convenience wrapper around a {@link RemotePortal} with an {@link InProcessRemote} remote. This eliminates the need for
 * a real transport implementation.
 *
 * @packageDocumentation
 */

import {
    IActorCallRequest,
    IActorCallResponse,
    IBackOff,
    IInstanceContainer,
    IInvokeOptions,
    IInvokeResult,
    IPortal,
    IRemote,
    ITypedPortal
} from '@darlean/base';
import { ImmediateBackOff, RemotePortal, TypedPortal } from './remoteinvocation';
import { normalizeActorType } from './shared';

export const NOT_REGISTERED = 'NOT_REGISTERED';

/**
 * Implementation of {@link IRemote} that invokes actor instances that live within the current
 * process (instead of in other processes via a message bus, as is the typical implementation of
 * a remote). This is performed by registering an {@link instances.IInstanceContainer} for each actor type
 * by means of the {@link register} method.
 */
export class InProcessRemote implements IRemote {
    protected containers: Map<string, IInstanceContainer<object>>;

    constructor() {
        this.containers = new Map();
    }

    public register(type: string, container: IInstanceContainer<object>) {
        this.containers.set(normalizeActorType(type), container);
    }

    public async invoke(options: IInvokeOptions): Promise<IInvokeResult> {
        const request = options.content as IActorCallRequest;
        const container = this.containers.get(request.actorType);
        if (container) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const actor = container.obtain(request.actorId) as any;
            const result = await actor[request.actionName](...(request.arguments ?? []));
            return {
                content: {
                    result
                } as IActorCallResponse
            };
        }
        return {
            errorCode: NOT_REGISTERED
        };
    }
}

/**
 * Implementation of {@link IPortal} that serves actor instances that live in the current process.
 * This merely is a convenience wrapper around a {@link RemotePortal} that is configured to use
 * an {@link InProcessRemote} remote. An {@link ImmediateBackOff} is used as default backoff mechanism.
 */
export class LocalPortal implements IPortal {
    protected remote: InProcessRemote;
    protected backoff: IBackOff;
    protected portal: RemotePortal;

    /**
     *
     * @param backoff The backoff to be used. Defaults to an {@link ImmediateBackOff} backoff.
     */
    constructor(backoff?: IBackOff) {
        this.remote = new InProcessRemote();
        this.backoff = backoff ?? new ImmediateBackOff();
        this.portal = new RemotePortal(this.remote, this.backoff);
    }

    /**
     * Registers a contain to provide actor instances for the given actor type.
     * @param type The type for which the container provides actor instances
     * @param container The container that provides the actor instances
     */
    public register<T extends object>(type: string, container: IInstanceContainer<T>) {
        this.portal.addMapping(type, 'local');
        this.remote.register(type, container);
    }

    public retrieve<T extends object>(type: string, id: string[]): T {
        return this.portal.retrieve(type, id);
    }

    public sub<T extends object>(type: string, subId: string[]): ITypedPortal<T> {
        return new TypedPortal<T>(this.portal, type, subId);
    }
}
