/**
 * User code can invoke remote actors by first obtaining an {@link IPortal} instance (like {@link RemotePortal} or
 * {@link localinvocation.LocalPortal}) and then obtaining a local actor proxy by means of {@link IPortal.retrieve}.
 *
 * The default {@link IPortal} implementation, {@link RemotePortal}, has a reference to an {@link IRemote} to
 * perform the actual remote action calls (via {@link IRemote.invoke}). It converts the method calls on the
 * proxy objects to an {@link IInvokeOptions} object with an {@link IActorCallRequest} as content, then
 * performs the call via {@link IRemote.invoke}, awaits the answer (which is an {@link IInvokeResult} with an
 * {@link IActorCallResponse} as content), and returns the {@link IActorCallResponse.result} or throws an
 * {@link ActorError} (when the remote actor threw an exception) or an {@link InvokeError} when the request
 * could not be complete due to technical causes.
 *
 * ## Backoff mechanism
 *
 * In order to handle short-living network issues and actor reincarnation without having to bother the user code
 * with that, the {@link RemotePortal} repeatedly retries to invoke the remote actor with certain time
 * intervals. This backoff mechanism is provided by an {@link IBackOff} instance like {@link ExponentialBackOff},
 * which provides a backoff with exponentially increasing delays.
 *
 * ## Actor placement
 *
 * In order to know to which destination (app) an {@link IActorCallRequest} should be sent to, the {@link RemotePortal}
 * uses the {@link IActorPlacement} information it receives via the {@link RemotePortal.addMapping} and {@link RemotePortal.removeMapping} methods.
 *
 * ## Local (in process) use
 *
 * For local use (that is, when all code and actors live in the same process), see module {@link localinvocation}.
 *
 * @packageDocumentation
 */

import {
    ERROR_CODE_NO_RECEIVERS_AVAILABLE,
    ERROR_PARAMETER_REDIRECT_DESTINATION,
    IActorCallRequest,
    IActorCallResponse,
    IActorPlacement,
    IBackOff,
    IInvokeAttempt,
    IInvokeOptions,
    InvokeError,
    IPortal,
    IRemote,
    ITypedPortal
} from '@darlean/base';
import { ITime } from '@darlean/utils';
import { sleep } from '@darlean/utils';
import { ActorError, normalizeActionName, normalizeActorType } from './shared';

/**
 * Implementation of {@link ITypedPortal} that returns instances of a specific type
 * from a given portal.
 */
export class TypedPortal<T extends object> implements ITypedPortal<T> {
    protected portal: IPortal;
    protected type: string;
    protected idPrefix?: string[];

    /**
     *
     * @param portal The portal from which instances are to be retrieved
     * @param type The type of actors of which instances are to be retrieved
     * @param idPrefix AN optional prefix with which id's are prefixed during {@link retreive}.
     */
    constructor(portal: IPortal, type: string, idPrefix?: string[]) {
        this.portal = portal;
        this.type = type;
        this.idPrefix = idPrefix;
    }

    public retrieve(id: string[]): T {
        return this.portal.retrieve(this.type, this.idPrefix ? [...this.idPrefix, ...id] : id);
    }

    public sub(idPrefix: string[]): ITypedPortal<T> {
        return new TypedPortal<T>(this.portal, this.type, [...(this.idPrefix ?? []), ...idPrefix]);
    }
}

/**
 * Implementation of {@link IBackOff} that starts with an initial delay, which is
 * multiplied with a certain factor after every invocation. A spread of 50% is
 * applied to achieve (pseudo)random behaviour.
 */
export class ExponentialBackOff implements IBackOff {
    protected time: ITime;
    protected factor: number;
    protected initial: number;

    constructor(time: ITime, initial: number, factor: number) {
        this.time = time;
        this.factor = factor;
        this.initial = initial;
    }

    public begin(maxDurationMS?: number): () => Promise<boolean> {
        let value = this.initial;
        const maxTime = maxDurationMS === undefined ? undefined : this.time.machineTicks() + maxDurationMS;

        return async () => {
            const delay = Math.max(0, (Math.random() + 0.5) * value);
            value *= this.factor;
            const newTime = this.time.machineTicks() + delay;
            if (maxTime === undefined || newTime < maxTime) {
                await sleep(delay);
                return true;
            } else {
                return false;
            }
        };
    }
}

/**
 * Implementation of {@link IBackOff} that returns immediately (that is, effectively
 * no backoff/delay).
 */
export class ImmediateBackOff implements IBackOff {
    public begin(_maxDurationMS?: number): () => Promise<boolean> {
        return async () => {
            return true;
        };
    }
}

/**
 * Used internally to keep administration of which actor type is present on which
 * destinations, and what the current placement settings are for the actor type.
 */
interface IActorTypeInfo {
    destinations: string[];
    placement?: IActorPlacement;
}

/**
 * Portal that provides access to actors in other apps via an {@link IRemote} instance.
 */
export class RemotePortal implements IPortal {
    protected remote: IRemote;
    protected backoff: IBackOff;
    // Map from actor type to list of online receivers that provide the actor type
    protected mapping: Map<string, IActorTypeInfo>;

    constructor(remote: IRemote, backoff: IBackOff) {
        this.remote = remote;
        this.backoff = backoff;
        this.mapping = new Map();
    }

    public retrieve<T extends object>(type: string, id: string[]): T {
        const instance = {} as T;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const p = Proxy.revocable(instance, {
            get: (_target, prop, _receiver) => {
                // Assume the caller is only trying to get functions (not properties, fields etc)
                // we simply return a getter function implementation.
                return async function (...args: unknown[]) {
                    const actorType = normalizeActorType(type);
                    const actionName = normalizeActionName(prop.toString());

                    const content: IActorCallRequest = {
                        actorType,
                        actorId: id,
                        actionName,
                        arguments: Array.from(args)
                    };

                    const info: { suggestion: string | undefined } = { suggestion: undefined };

                    const backoff = self.backoff.begin(5000);
                    const errors: IInvokeAttempt[] = [];

                    for await (const destination of self.iterateDestinations(actorType, id, info)) {
                        const moment = Date.now();

                        if (destination !== '') {
                            info.suggestion = undefined;
                            const options: IInvokeOptions = {
                                destination,
                                content
                            };

                            const result = await self.remote.invoke(options);
                            if (result.errorCode) {
                                errors.push({ requestTime: new Date(moment).toISOString(), options, result });
                                info.suggestion = result.errorParameters?.[ERROR_PARAMETER_REDIRECT_DESTINATION] as string;
                            } else {
                                if (result.content) {
                                    const response = result.content as IActorCallResponse;
                                    if (response.error) {
                                        throw new ActorError(
                                            response.error.code,
                                            response.error.message,
                                            response.error.parameters,
                                            response.error.stack
                                        );
                                    } else {
                                        return response.result;
                                    }
                                } else {
                                    throw new Error('No content');
                                }
                            }
                        } else {
                            errors.push({
                                requestTime: new Date(moment).toISOString(),
                                result: {
                                    errorCode: ERROR_CODE_NO_RECEIVERS_AVAILABLE
                                }
                            });
                        }

                        if (!(await backoff())) {
                            break;
                        }
                    }
                    throw new InvokeError(`Failed to invoke remote method [${actorType}.${actionName}]`, errors);
                };
            }
        });
        return p.proxy;
    }

    public addMapping(actorType: string, receiver: string, placement?: IActorPlacement) {
        actorType = normalizeActorType(actorType);

        const entry = this.mapping.get(actorType);
        if (entry) {
            if (!entry.destinations.includes(receiver)) {
                entry.destinations.push(receiver);
            }
            if (placement && placement.version > (entry.placement?.version ?? '')) {
                entry.placement = placement;
            }
        } else {
            this.mapping.set(actorType, { destinations: [receiver], placement });
        }
    }

    public removeMapping(actorType: string, receiver: string) {
        actorType = normalizeActorType(actorType);

        const entry = this.mapping.get(actorType);
        if (entry) {
            const idx = entry.destinations.indexOf(receiver);
            if (idx >= 0) {
                entry.destinations.splice(idx, 1);
            }
        }
    }

    public removeReceiver(receiver: string) {
        for (const actorType of this.mapping.keys()) {
            this.removeMapping(actorType, receiver);
        }
    }

    public sub<T extends object>(type: string, idPrefix?: string[]): ITypedPortal<T> {
        return new TypedPortal<T>(this, type, idPrefix);
    }

    protected findReceivers(actorType: string) {
        actorType = normalizeActorType(actorType);

        return this.mapping.get(actorType)?.destinations || [];
    }

    protected *iterateDestinations(type: string, id: string[], info: { suggestion: string | undefined }) {
        const randomReceiversDone: string[] = [];

        for (let i = 0; i < 10; i++) {
            if (info.suggestion) {
                const sug = info.suggestion;
                info.suggestion = undefined;
                yield sug;
            } else {
                // Derive the placement every loop iteration, as new apps may
                // have registered in between.
                const placement = this.mapping.get(type)?.placement;
                let boundTo = '';
                if (placement?.bindIdx !== undefined) {
                    const idx = placement.bindIdx >= 0 ? placement.bindIdx : id.length + placement.bindIdx;
                    boundTo = id[idx];
                }

                const receivers = this.findReceivers(type);
                if (receivers.length > 0) {
                    if (boundTo) {
                        if (receivers.includes(boundTo)) {
                            yield boundTo;
                        } else {
                            yield '';
                        }
                    } else {
                        const idx = Math.floor(Math.random() * receivers.length);
                        const receiver = receivers[idx];

                        // When the receiver was already randomly selected before, first try
                        // to select one of the other available receivers. This to avoid that
                        // we randomly select the same receiver that is not available. For
                        // simplicity, we do this selection simply linear (not randomly).
                        if (randomReceiversDone.includes(receiver)) {
                            for (const receiver2 of receivers) {
                                if (!randomReceiversDone.includes(receiver2)) {
                                    randomReceiversDone.push(receiver2);
                                    yield receiver2;
                                }
                            }
                        } else {
                            randomReceiversDone.push(receiver);
                        }

                        yield receivers[idx];
                    }
                } else {
                    yield '';
                }
            }
        }
    }
}
