import {
    IActionError,
    IActorCallRequest,
    IActorCallResponse,
    IInvokeOptions,
    IInvokeResult,
    IMultiTypeInstanceContainer,
    IRemote
} from '@darlean/base';
import { deeper } from '@darlean/utils';
import * as uuid from 'uuid';
import { ITransport, ITransportFailure, ITransportSession } from './infra/transport';
import { toActionError, toFrameworkError } from './instances';
import { IRemoteCallTags, ITransportTags } from './infra/wiretypes';

export type ITransportActorCallRequest = IActorCallRequest;
export type ITransportActorCallResponse = IActorCallResponse;

export const TRANSPORT_ERROR_TRANSPORT_ERROR = 'TRANSPORT_ERROR';
export const TRANSPORT_ERROR_TRANSPORT_CALL_TIMEOUT = 'TRANSPORT_CALL_TIMEOUT';
export const TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED = 'TRANSPORT_CALL_INTERRUPTED';

export const TRANSPORT_ERROR_PARAMETER_MESSAGE = 'Message';

const DEBUG_PENDING_CALLS = true;
const ABORT_PENDING_CALLS = true;

interface IRemotePendingCall {
    resolve: (value: IInvokeResult) => void;
    reject: (error: unknown) => void;
    timeout: NodeJS.Timeout;
    options?: IInvokeOptions;
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
        this.session = await this.transport.connect(this.appId, (tags) => this.handleMessage(tags));
    }

    public async finalize() {
        await this.session?.finalize();
        this.session = undefined;

        const pending = this.pendingCalls;
        this.pendingCalls = new Map();
        if (pending.size > 0) {
            console.log('THERE ARE STILL', pending.size, 'PENDING CALLS');
            for (const p of pending.values()) {
                if (p.options) {
                    console.log('PENDING CALL', JSON.stringify(p.options));
                }
            }
            // The following code cancels aLL pending calls which effectively helps to
            // prevent the application from hanging at exit, but doing so is a sign that
            // somewhere else things are not cleaned up properly.

            if (ABORT_PENDING_CALLS) {
                for (const p of pending.values()) {
                    clearTimeout(p.timeout);
                    p.reject(TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED);
                }
            }
        }
    }

    public invoke(options: IInvokeOptions): Promise<IInvokeResult> {
        return deeper('io.darlean.remotetransport.invoke', options.destination).perform(() => this.invokeImpl(options));
    }

    protected invokeImpl(options: IInvokeOptions): Promise<IInvokeResult> {
        const callId = uuid.v4();

        const tags: ITransportTags & IRemoteCallTags = {
            transport_receiver: options.destination,
            transport_return: this.appId,
            remotecall_kind: 'call',
            remotecall_id: callId
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
                }, 60 * 1000),
                options: DEBUG_PENDING_CALLS ? options : undefined
            };
            this.pendingCalls.set(callId, call);

            if (options.aborter) {
                options.aborter.handle(() => {
                    this.pendingCalls.delete(callId);
                    clearTimeout(call.timeout);
                    resolve({
                        errorCode: TRANSPORT_ERROR_TRANSPORT_CALL_INTERRUPTED
                    });
                });
            }

            if (this.session) {
                this.session.send(tags, this.toTransportRequest(options.content as IActorCallRequest));
            } else {
                clearTimeout(call.timeout);
                resolve({
                    errorCode: TRANSPORT_ERROR_TRANSPORT_ERROR,
                    errorParameters: {
                        [TRANSPORT_ERROR_PARAMETER_MESSAGE]: 'Transport not ready'
                    }
                });
            }
        });
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

    protected handleMessage(
        tags: ITransportTags &
            IRemoteCallTags &
            (ITransportFailure | ITransportActorCallResponse | ITransportActorCallRequest | never)
    ): void {
        function makeReturnTags(rec: string) {
            const e1: ITransportTags & IRemoteCallTags = {
                transport_receiver: rec,
                remotecall_id: tags?.remotecall_id,
                remotecall_kind: 'return'
            };
            return e1;
        }

        if (tags) {
            if (tags.remotecall_kind === 'return') {
                // Handling of a return message that contains the response (or error result) of a previous outgoing call
                const call = this.pendingCalls.get(tags.remotecall_id);
                if (call !== undefined) {
                    clearTimeout(call.timeout);
                    this.pendingCalls.delete(tags.remotecall_id);
                    if ((tags as ITransportFailure).code) {
                        call.resolve({
                            errorCode: TRANSPORT_ERROR_TRANSPORT_ERROR,
                            errorParameters: {
                                [TRANSPORT_ERROR_PARAMETER_MESSAGE]: (tags as ITransportFailure).message
                            }
                        });
                    } else {
                        const result = this.fromTransportResponse(tags as ITransportActorCallResponse);
                        call.resolve({
                            content: result
                        });
                    }
                }
            } else {
                // Handle a new message that is to be sent to a local actor
                setImmediate(() => {
                    const request = this.fromTransportRequest(tags as ITransportActorCallRequest);
                    deeper(
                        'io.darlean.remotetransport.incoming-action',
                        `${request.actorType}::${request.actorId}::${request.actionName}`
                    ).perform(async () => {
                        try {
                            const wrapper = this.instanceContainer.wrapper(request.actorType, request.actorId);
                            try {
                                const result = await wrapper.invoke(request.actionName, request.arguments);
                                const response: IActorCallResponse = {
                                    result
                                };
                                if (tags.transport_return) {
                                    this.session?.send(makeReturnTags(tags.transport_return), this.toTransportResponse(response));
                                }
                            } catch (e) {
                                const err = toActionError(e);

                                const msg = `in ${request.actorType}::${request.actionName} (application: ${this.appId})`;
                                if (err.stack) {
                                    const lines = err.stack.split('\n');
                                    const lines2 = [lines[0], '    ' + msg, ...lines.slice(1)];
                                    err.stack = lines2.join('\n');
                                } else {
                                    err.stack = msg;
                                }

                                // The proxy already catches application errors and properly encapsulates those
                                // within an ApplicationError. Also, when framework errors occur, they are
                                // delivered as FrameworkError. So, we just have to make sure here that anything
                                // unexpected that passed through is nicely converted.
                                const response: IActorCallResponse = {
                                    error: err
                                };

                                if (tags.transport_return) {
                                    this.session?.send(makeReturnTags(tags.transport_return), this.toTransportResponse(response));
                                }
                            }
                        } catch (e) {
                            const response: IActorCallResponse = {
                                error: toFrameworkError(e)
                            };

                            if (tags.transport_return) {
                                this.session?.send(makeReturnTags(tags.transport_return), this.toTransportResponse(response));
                            }
                        }
                    });
                });
            }
        }
    }
}
