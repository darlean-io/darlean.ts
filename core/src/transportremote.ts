import {
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
import { toActorError } from './instances';

export type ITransportActorCallRequest = IActorCallRequest;
export type ITransportActorCallResponse = IActorCallResponse;

export const INVOKE_ERROR_TRANSPORT_ERROR = 'TRANSPORT_ERROR';
export const INVOKE_ERROR_CALL_TIMEOUT = 'CALL_TIMEOUT';

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
        await this.instanceContainer.finalize();
        await this.session?.finalize();
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
                        errorCode: INVOKE_ERROR_CALL_TIMEOUT
                    });
                }, 60 * 1000)
            };
            this.pendingCalls.set(callId, call);
            if (this.session) {
                this.session.send(env, this.toTransportRequest(options.content as IActorCallRequest));
            } else {
                resolve({
                    errorCode: INVOKE_ERROR_TRANSPORT_ERROR,
                    errorParameters: {
                        message: 'Transport not ready'
                    }
                })
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
        return content;
    }

    protected fromTransportResponse(content: ITransportActorCallResponse): IActorCallResponse {
        return content;
    }

    protected handleMessage(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): void {
        const env = envelope.child as IRemoteCallEnvelope;
        if (env) {
            if (env.remoteCallKind === 'return') {
                const call = this.pendingCalls.get(env.remoteCallId);
                if (call) {
                    clearTimeout(call.timeout);
                    this.pendingCalls.delete(env.remoteCallId);
                    if (failure) {
                        call.resolve({
                            errorCode: INVOKE_ERROR_TRANSPORT_ERROR,
                            errorParameters: {
                                message: failure.message
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
                setImmediate(async () => {
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
                        const response: IActorCallResponse = {
                            error: toActorError(e)
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
