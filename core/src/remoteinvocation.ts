/**
 * User code can invoke remote actors by first obtaining an {@link IPortal} instance (like {@link RemotePortal} or
 * {@link localinvocation.LocalPortal}) and then obtaining a local actor proxy by means of {@link IPortal.retrieve}.
 *
 * The default {@link IPortal} implementation, {@link RemotePortal}, has a reference to an {@link IRemote} to
 * perform the actual remote action calls (via {@link IRemote.invoke}). It converts the method calls on the
 * proxy objects to an {@link IInvokeOptions} object with an {@link IActorCallRequest} as content, then
 * performs the call via {@link IRemote.invoke}, awaits the answer (which is an {@link IInvokeResult} with an
 * {@link IActorCallResponse} as content), and returns the {@link IActorCallResponse.result} or throws an
 * {@link ApplicationError} (when the remote actor threw an exception) or a {@link FrameworkError} when the request
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
    FRAMEWORK_ERROR_NO_RECEIVERS_AVAILABLE,
    FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION,
    FRAMEWORK_ERROR_INVOKE_ERROR,
    IActorCallRequest,
    IActorCallResponse,
    IActorPlacement,
    IBackOff,
    IInvokeOptions,
    IPortal,
    IRemote,
    ITypedPortal,
    ApplicationError,
    FrameworkError,
    IAbortable,
} from '@darlean/base';
import { Aborter, encodeKey, ITime } from '@darlean/utils';
import { sleep } from '@darlean/utils';
import { normalizeActionName, normalizeActorType } from './shared';
import { TRANSPORT_ERROR_PARAMETER_MESSAGE } from './transportremote';

/**
 * Implementation of {@link ITypedPortal} that returns instances of a specific type
 * from a given portal.
 */
export class TypedPortal<T extends object> implements ITypedPortal<T> {
    protected portal: IPortal;
    protected type: string;

    /**
     *
     * @param portal The portal from which instances are to be retrieved
     * @param type The type of actors of which instances are to be retrieved
     */
    constructor(portal: IPortal, type: string) {
        this.portal = portal;
        this.type = type;
    }

    public retrieve(id: string[]): T & IAbortable {
        return this.portal.retrieve(this.type, id);
    }

    public prefix(idPrefix: string[]): ITypedPortal<T> {
        return new PrefixTypedPortal<T>(this, idPrefix);
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

    public begin(maxDurationMS?: number): (aborter?: Aborter) => Promise<boolean> {
        let value = this.initial;
        const maxTime = maxDurationMS === undefined ? undefined : this.time.machineTicks() + maxDurationMS;

        return async ( aborter?: Aborter ) => {
            const delay = Math.max(0, (Math.random() + 0.5) * value);
            value *= this.factor;
            const newTime = this.time.machineTicks() + delay;
            if (maxTime === undefined || newTime < maxTime) {
                await sleep(delay, aborter);
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
 * Used to keep administration of which actor type is present on which
 * destinations, and what the current placement settings are for the actor type.
 */
export interface IActorTypeInfo {
    destinations: string[];
    placement?: IActorPlacement;
}

export interface IActorRegistry {
    findPlacement(type: string): IActorTypeInfo | undefined;
}

export class ActorRegistry implements IActorRegistry {
    // Map from actor type to list of online receivers that provide the actor type
    protected mapping: Map<string, IActorTypeInfo>;

    constructor() {
        this.mapping = new Map();
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

    public findPlacement(type: string): IActorTypeInfo | undefined {
        return this.mapping.get(normalizeActorType(type));
    }

    public getAll(): Map<string, IActorTypeInfo> {
        return this.mapping;
    }
}

export interface IPlacementCache {
    get(actorType: string, id: string[]): string | undefined;
    put(actorType: string, id: string[], receiver: string | undefined): void;
}

export class PlacementCache implements IPlacementCache {
    private items: Map<string, string>;
    private capacity: number;

    constructor(capacity: number) {
        this.items = new Map();
        this.capacity = capacity;
    }

    public get(actorType: string, id: string[]): string | undefined {
        const key = encodeKey([normalizeActorType(actorType), ...id]);
        const value = this.items.get(key);
        if (value !== undefined) {
            // Move to end of LRU
            this.items.delete(key);
            this.items.set(key, value);
        }
        return value;
    }

    public put(actorType: string, id: string[], receiver: string | undefined): void {
        const key = encodeKey([normalizeActorType(actorType), ...id]);
        this.items.delete(key);
        if (receiver !== undefined) {
            this.items.set(key, receiver);
            this.cleanup();
        }
    }

    protected cleanup() {
        if (this.items.size > this.capacity) {
            for (const key of this.items.keys()) {
                this.items.delete(key);
                if (this.items.size < this.capacity) {
                    break;
                }
            }
        }
    }
}

/**
 * Portal that provides access to actors in other apps via an {@link IRemote} instance.
 */
export class RemotePortal implements IPortal {
    protected remote: IRemote;
    protected backoff: IBackOff;
    protected registry: IActorRegistry;
    protected placementCache?: IPlacementCache;

    constructor(remote: IRemote, backoff: IBackOff, registry: IActorRegistry, placementCache?: IPlacementCache) {
        this.remote = remote;
        this.backoff = backoff;
        this.registry = registry;
        this.placementCache = placementCache;
    }

    public setRegistry(value: IActorRegistry) {
        this.registry = value;
    }

    public retrieve<T extends object>(type: string, id: string[]): T & IAbortable {
        const instance = {} as T;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        let nextCallAborter: Aborter | undefined;
        const p = Proxy.revocable(instance, {
            get: (_target, prop, _receiver) => {
                if (prop === 'aborter') {
                    return (value: Aborter) => {
                        nextCallAborter = value;
                    }
                }

                // Assume the caller is only trying to get functions (not properties, fields etc)
                // we simply return a getter function implementation.
                return async function (...args: unknown[]) {
                    let aborted = false;
                    const aborter = nextCallAborter;
                    nextCallAborter = undefined;
                    let subAborter: Aborter | undefined;

                    // console.log('ABORTER', prop.toString(), aborter);

                    if (aborter) {
                        aborter.handle( () => {
                            aborted = true;
                            subAborter?.abort();
                        });
                    }
    
                    const actorType = normalizeActorType(type);
                    const actionName = normalizeActionName(prop.toString());

                    const content: IActorCallRequest = {
                        actorType,
                        actorId: id,
                        actionName,
                        arguments: Array.from(args)
                    };

                    const info: { suggestion: string | undefined } = { suggestion: undefined };

                    const placement = self.registry.findPlacement(type)?.placement;
                    if (placement?.sticky && self.placementCache) {
                        info.suggestion = self.placementCache.get(actorType, id);
                    }

                    const backoff = self.backoff.begin(5000);
                    const nested: FrameworkError[] = [];

                    for await (const destination of self.iterateDestinations(actorType, id, info)) {
                        if (aborted) {
                            throw new FrameworkError(
                                FRAMEWORK_ERROR_INVOKE_ERROR,
                                'Interrupted while invoking remote method [ActionName] on an instance of [ActorType]',
                                {
                                    ActorType: actorType,
                                    ActionName: actionName
                                },
                                undefined,
                                nested
                            );
                        }
                        const moment = Date.now();

                        if (destination !== '') {
                            info.suggestion = undefined;
                            subAborter = (aborter) ? new Aborter() : undefined;
                            
                            const options: IInvokeOptions = {
                                destination,
                                content,
                                aborter: subAborter
                            };

                            const result = await self.remote.invoke(options);
                            subAborter = undefined;

                            if (result.errorCode) {
                                nested.push(
                                    new FrameworkError(
                                        result.errorCode,
                                        (result.errorParameters?.[TRANSPORT_ERROR_PARAMETER_MESSAGE] as string) ??
                                            result.errorCode,
                                        {
                                            requestTime: new Date(moment).toISOString(),
                                            requestOptions: options,
                                            requestResult: result
                                        }
                                    )
                                );
                            } else {
                                if (result.content) {
                                    let ok = false;
                                    try {
                                        const response = result.content as IActorCallResponse;
                                        if (response.error) {
                                            if (response.error.kind === 'framework') {
                                                const redirect =
                                                    response.error.parameters?.[FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION];
                                                info.suggestion = redirect as string;
                                            } else {
                                                ok = true;
                                                throw new ApplicationError(
                                                    response.error.code,
                                                    response.error.template,
                                                    response.error.parameters,
                                                    response.error.stack,
                                                    response.error.nested,
                                                    response.error.message
                                                );
                                            }
                                        } else {
                                            ok = true;
                                            return response.result;
                                        }
                                    } finally {
                                        if (ok && placement?.sticky && self.placementCache) {
                                            self.placementCache.put(actorType, id, options.destination);
                                        }
                                    }
                                } else {
                                    throw new Error('No content');
                                }
                            }
                        } else {
                            nested.push(
                                new FrameworkError(
                                    FRAMEWORK_ERROR_NO_RECEIVERS_AVAILABLE,
                                    'No receivers available at [RequestTime] to process an action on an instance of [ActorType]',
                                    {
                                        RequestTime: new Date(moment).toISOString(),
                                        ActorType: actorType,
                                        ActionName: actionName
                                    }
                                )
                            );
                        }

                        if (!aborted) {
                            subAborter = aborter ? new Aborter() : undefined;
                            try {
                                if (!(await backoff(aborter))) {
                                    break;
                                }
                            } finally {
                                subAborter = undefined;
                            }
                        }
                    }

                    if (placement?.sticky && self.placementCache) {
                        self.placementCache.put(actorType, id, undefined);
                    }

                    throw new FrameworkError(
                        FRAMEWORK_ERROR_INVOKE_ERROR,
                        'Failed to invoke remote method [ActionName] on an instance of [ActorType]: [FirstMessage] ... [LastMessage]',
                        {
                            ActorType: actorType,
                            ActionName: actionName,
                            FirstMessage: nested[0]?.message ?? '',
                            LastMessage: nested[nested.length - 1]?.message ?? ''
                        },
                        undefined,
                        nested
                    );
                };
            }
        });
        return p.proxy as T & IAbortable;
    }

    public typed<T extends object>(type: string): ITypedPortal<T> {
        return new TypedPortal<T>(this, type);
    }

    public prefix(idPrefix: string[]): IPortal {
        return new PrefixPortal(this, idPrefix);
    }

    protected findReceivers(actorType: string) {
        actorType = normalizeActorType(actorType);

        return this.registry.findPlacement(actorType)?.destinations || [];
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
                const placement = this.registry.findPlacement(type)?.placement;
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

export class PrefixPortal implements IPortal {
    private parent: IPortal;
    private idPrefix: string[];

    constructor(parent: IPortal, idPrefix: string[]) {
        this.parent = parent;
        this.idPrefix = idPrefix;
    }

    public retrieve<T extends object>(type: string, id: string[]): T & IAbortable {
        return this.parent.retrieve(type, [...this.idPrefix, ...id]);
    }

    typed<T extends object>(type: string): ITypedPortal<T> {
        return new TypedPortal(this, type);
    }

    prefix(idPrefix: string[]): IPortal {
        return new PrefixPortal(this, idPrefix);
    }
}

export class PrefixTypedPortal<T extends object> implements ITypedPortal<T> {
    private parent: ITypedPortal<T>;
    private idPrefix: string[];

    constructor(parent: ITypedPortal<T>, idPrefix: string[]) {
        this.parent = parent;
        this.idPrefix = idPrefix;
    }

    retrieve(id: string[]): T & IAbortable {
        return this.parent.retrieve([...this.idPrefix, ...id]);
    }

    prefix(idPrefix: string[]): ITypedPortal<T> {
        return new PrefixTypedPortal<T>(this, idPrefix);
    }
}
