import {
    IActionError,
    IActorCallRequest,
    IActorCallResponse,
    IInvokeOptions,
    IInvokeResult,
    IMultiTypeInstanceContainer,
    IRemote
} from '@darlean/base';
import * as uuid from 'uuid';
import { IEnvelope } from './infra/envelope';
import { ITransport, ITransportEnvelope, ITransportFailure, ITransportSession } from './infra/transport';
import { toActionError, toFrameworkError } from './instances';

export type ITransportActorCallRequest = IActorCallRequest;
export type ITransportActorCallResponse = IActorCallResponse;

export const TRANSPORT_ERROR_TRANSPORT_ERROR = 'TRANSPORT_ERROR';
export const TRANSPORT_ERROR_TRANSPORT_CALL_TIMEOUT = 'TRANSPORT_CALL_TIMEOUT';
export const TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED = 'TRANSPORT_CALL_INTERRUPTED';

export const TRANSPORT_ERROR_PARAMETER_MESSAGE = 'Message';

interface IRemotePendingCall {
    resolve: (value: IInvokeResult) => void;
    reject: (error: unknown) => void;
    timeout: NodeJS.Timeout;
}

export interface IRemoteCallEnvelope extends IEnvelope {
    remoteCallKind: 'call' | 'return';
    remoteCallId: string;
}

export class TransportRemote implements IRemote {
    protected transport: ITransport;
    protected session?: ITransportSession;
    protected appId: string;
    protected pendingCalls: Map<string, IRemotePendingCall>;
    protected instanceContainer: IMultiTypeInstanceContainer;
    
    /**
     * Creates a new TransportRemote.
     * @param appId The id of the current application with which the remote makes itself known to the transport
     * @param transport The transport mechanism used to send/receive messages
     * @param container The multi-type instance container that this remote can dispatch incoming action requests to
     */
    constructor(appId: string, transport: ITransport, container: IMultiTypeInstanceContainer) {
        this.appId = appId;
        this.transport = transport;
        this.pendingCalls = new Map();
        this.instanceContainer = container;
    }

    public async init() {
        this.session = await this.transport.connect(this.appId, (envelope, contents, failure) =>
            this.handleMessage(envelope, contents, failure)
        );
    }

    public async finalize() {
        await this.session?.finalize();
        this.session = undefined;

        // The following code cancels aLL pending calls which effectively helps to
        // prevent the application from hanging at exit, but doing so is a sign that
        // somewhere else things are not cleaned up properly.
        // So let's keep this code commented out for now.
        /*const pending = this.pendingCalls;
        this.pendingCalls = new Map();
        for (const p of pending.values()) {
            clearTimeout(p.timeout);
            p.reject(TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED);
        }*/
    }

    public async invoke(options: IInvokeOptions): Promise<IInvokeResult> {
        const callId = uuid.v4();
        
        const env: ITransportEnvelope = {
            receiverId: options.destination,
            child: {
                remoteCallKind: 'call',
                remoteCallId: callId
            } as IRemoteCallEnvelope,
            returnEnvelopes: [this.makeReturnEnvelope(callId)]
        };

        return new Promise((resolve, reject) => {
            const call: IRemotePendingCall = {
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.pendingCalls.delete(callId);
                    resolve({
                        errorCode: TRANSPORT_ERROR_TRANSPORT_CALL_TIMEOUT
                    });
                }, 60 * 1000)
            };
            this.pendingCalls.set(callId, call);
            
            if (options.aborter) {
                options.aborter.handle( () => {
                    this.pendingCalls.delete(callId);
                    clearTimeout(call.timeout);
                    resolve({
                        errorCode: TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED
                    });
                });
            }

            if (this.session) {
                this.session.send(env, this.toTransportRequest(options.content as IActorCallRequest));
            } else {
                resolve({
                    errorCode: TRANSPORT_ERROR_TRANSPORT_ERROR,
                    errorParameters: {
                        [TRANSPORT_ERROR_PARAMETER_MESSAGE]: 'Transport not ready'
                    }
                });
            }
        });
    }

    protected makeReturnEnvelope(callId: string): ITransportEnvelope {
        return {
            receiverId: this.appId,
            child: {
                remoteCallId: callId,
                remoteCallKind: 'return'
            } as IRemoteCallEnvelope
        };
    }

    protected toTransportRequest(content: IActorCallRequest): ITransportActorCallRequest {
        return content;
    }

    protected fromTransportRequest(content: ITransportActorCallRequest): IActorCallRequest {
        return content;
    }

    protected toTransportResponse(content: IActorCallResponse): ITransportActorCallResponse {
        return {
            result: content.result,
            error: content.error ? this.errorToTransportError(content.error) : undefined
        };
    }

    protected errorToTransportError(error: IActionError): IActionError {
        // Explicitly copy over all fields. The default BSON implementation skips some fields.
        return {
            code: error.code,
            kind: error.kind,
            message: error.message,
            nested: error.nested?.map((x) => this.errorToTransportError(x)) ?? undefined,
            parameters: error.parameters,
            stack: error.stack,
            template: error.template
        };
    }

    protected fromTransportResponse(content: ITransportActorCallResponse): IActorCallResponse {
        return content;
    }

    protected handleMessage(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): void {
        const env = envelope.child as IRemoteCallEnvelope;
        if (env) {
            if (env.remoteCallKind === 'return') {
                // Handling of a return message that contains the response (or error result) of a previous outgoing call
                const call = this.pendingCalls.get(env.remoteCallId);
                if (call) {
                    clearTimeout(call.timeout);
                    this.pendingCalls.delete(env.remoteCallId);
                    if (failure) {
                        call.resolve({
                            errorCode: TRANSPORT_ERROR_TRANSPORT_ERROR,
                            errorParameters: {
                                [TRANSPORT_ERROR_PARAMETER_MESSAGE]: failure.message
                            }
                        });
                    } else {
                        const result = this.fromTransportResponse(contents as ITransportActorCallResponse);
                        call.resolve({
                            content: result
                        });
                    }
                }
            } else {
                // Handle a new message that is to be sent to a remote actor
                setImmediate(async () => {
                    try {
                        const request = this.fromTransportRequest(contents as ITransportActorCallRequest);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const proxy = this.instanceContainer.obtain(request.actorType, request.actorId) as any;
                        try {
                            const result = await proxy[request.actionName](...request.arguments);
                            const response: IActorCallResponse = {
                                result
                            };
                            for (const returnEnvelope of envelope.returnEnvelopes ?? []) {
                                this.session?.send(returnEnvelope, this.toTransportResponse(response));
                            }
                        } catch (e) {
                            // The proxy already catches application errors and properly encapsulates those
                            // within an ApplicationError. Also, when framework errors occur, they are
                            // delivered as FrameworkError. So, we just have to make sure here that anything
                            // unexpected that passed through is nicely converted.
                            const response: IActorCallResponse = {
                                error: toActionError(e)
                            };

                            for (const returnEnvelope of envelope.returnEnvelopes ?? []) {
                                this.session?.send(returnEnvelope, this.toTransportResponse(response));
                            }
                        }
                    } catch (e) {
                        const response: IActorCallResponse = {
                            error: toFrameworkError(e)
                        };

                        for (const returnEnvelope of envelope.returnEnvelopes ?? []) {
                            this.session?.send(returnEnvelope, this.toTransportResponse(response));
                        }
                    }
                });
            }
        }
    }
}
