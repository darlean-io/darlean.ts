import { ITransportFailure, ITransport, MessageHandler, ITransportSession } from './transport';
import { connect, ErrorCode, Msg, NatsConnection, NatsError, Subscription } from 'nats';
import { currentScope, deeper, IDeSer, ITraceInfo } from '@darlean/utils';
import { deserialize, serialize } from './wiredeser';
import { ITracingTags, IRemoteCallTags, ITransportTags, TRANSPORT_ERROR_UNKNOWN_RECEIVER } from './wiretypes';
import { IActorCallRequest, IActorCallResponse } from '@darlean/base';

export const NATS_ERROR_NOT_CONNECTED = 'NOT_CONNECTED';
export const NATS_ERROR_SEND_FAILED = 'SEND_FAILED';
export const NATS_ERROR_SEND_NO_ACK = 'NO_ACK';

const BUF_NEWLINE = Buffer.from('\n', 'ascii');

const ACK_TIMEOUT = 4000;

export class NatsTransport implements ITransport {
    private deser: IDeSer;
    private seedUrls?: string[];
    private ackTimeout: number;

    constructor(deser: IDeSer, seedUrls?: string[], ackTimeout?: number) {
        this.deser = deser;
        this.seedUrls = seedUrls;
        this.ackTimeout = ackTimeout ?? ACK_TIMEOUT;
    }

    public async connect(appId: string, onMessage: MessageHandler): Promise<ITransportSession> {
        const session = new NatsTransportSession(this.deser, this.seedUrls, this.ackTimeout);
        await session.connect(appId, onMessage);
        return session;
    }
}

interface ISendItem {
    buffer: Buffer;
    handler: (err: unknown) => void;
}

interface ISendItems {
    receiver: string;
    messages: ISendItem[];
    len: number;
}

export class NatsTransportSession implements ITransportSession {
    private deser: IDeSer;
    private connection?: NatsConnection;
    private subscription?: Subscription;
    private appId?: string;
    private messageHandler?: MessageHandler;
    private seedUrls?: string[];
    private ackTimeout: number;
    private sendQueue: Map<string, ISendItems>;

    constructor(deser: IDeSer, seedUrls: string[] | undefined, ackTimeout: number) {
        this.deser = deser;
        this.seedUrls = seedUrls;
        this.ackTimeout = ackTimeout;
        this.sendQueue = new Map();
    }

    public async connect(appId: string, onMessage: MessageHandler): Promise<void> {
        this.appId = appId;
        this.messageHandler = onMessage;
        this.connection = await connect({ waitOnFirstConnect: true, maxReconnectAttempts: -1, servers: this.seedUrls });
        const subscription = this.connection.subscribe(appId);
        //const subscription = this.connection.subscribe(appId, { callback: (err, msg) => this.handleMessage(err, msg, onMessage) });
        this.subscription = subscription;
        setImmediate(async () => await this.listen(subscription, onMessage));
    }

    public send(
        tags: ITransportTags & IRemoteCallTags & ITracingTags,
        contents: IActorCallRequest | IActorCallResponse | ITransportFailure | undefined,
        failure?: ITransportFailure
    ): void {
        if (tags.transport_receiver == this.appId) {
            // Bypass NATS. That is not just a performance optimization. It also ensures that when the error situation is that
            // NATS is not available (like, NATS server not running), the error is properly fed back to the calling code.
            process.nextTick(() => {
                deeper('io.darlean.nats.bypass-nats').performSync(() =>
                    this.messageHandler?.({ ...tags, ...(contents as object), ...failure })
                );
            });
            return;
        }

        if (!this.connection) {
            this.sendFailureMessage(
                tags,
                'SEND_ERROR',
                `Unable to send to  [${tags.transport_receiver}]: [${NATS_ERROR_NOT_CONNECTED}]`
            );
            return;
        }

        const scope = currentScope();
        const cids = scope.getCorrelationIds();

        const msg: ITracingTags & ITransportTags & IRemoteCallTags = {
            tracing_cids: cids,
            tracing_parentUid: cids === undefined ? undefined : scope.getUid(),
            transport_receiver: tags.transport_receiver,
            transport_return: tags.transport_return,
            remotecall_id: tags.remotecall_id,
            remotecall_kind: tags.remotecall_kind,
            ...contents,
            ...failure
        };

        deeper('io.darlean.nats.send', tags.transport_receiver).performSync(() => {
            const buf = serialize(msg, this.deser); //isStringifyMsg(msg);
            this.sendImpl(tags.transport_receiver, buf, (e) => {
                const ne = e as NatsError;
                if (ne.code === ErrorCode.NoResponders) {
                    this.sendFailureMessage(
                        tags,
                        TRANSPORT_ERROR_UNKNOWN_RECEIVER,
                        `Receiver [${tags.transport_receiver}] is not registered to the nats transport`
                    );
                } else if (ne.code === ErrorCode.Timeout) {
                    // It USED TO BE normal to receive a timeout, because we do not send back a reply when we receive a message
                    // (that to avoid an unnecessary round trip). We have our own timeout mechanism that will fire when anything
                    // else goes wrong. So, we can just ignore the timeout.
                    // But we enabled the ack-mechanism ("m.respond()"), so now a timeout is really a signal that something is wrong
                    // and that the receiver did not receive the message,
                    if (this.ackTimeout > 0) {
                        this.sendFailureMessage(
                            tags,
                            NATS_ERROR_SEND_NO_ACK,
                            `No ack received after sending to  [${tags.transport_receiver}]: [${e}]`
                        );
                    }
                } else {
                    console.log('Error during nats send:', e, tags.transport_receiver);
                    this.sendFailureMessage(
                        tags,
                        NATS_ERROR_SEND_FAILED,
                        `Unable to send to  [${tags.transport_receiver}]: [${e}]`
                    );
                }
            });
        });
    }

    public async finalize(): Promise<void> {
        await this.subscription?.drain();
        await this.connection?.close();
    }

    protected sendImpl(receiver: string, msg: Buffer, onError: (error: unknown) => void): void {
        const MAX_BATCH_LEN = 10000;

        let items = this.sendQueue.get(receiver);
        const willExceedMaxSize = (items?.len ?? 0) + msg.length > MAX_BATCH_LEN;

        if (items === undefined) {
            items = { receiver, messages: [], len: 0 };
            this.sendQueue.set(receiver, items);
            if (!willExceedMaxSize) {
                // Set the trigger that will send out the current batch in the next event loop iteration.
                // This allows us to buffer quite some items and send them out in a batch.
                // We use setImmediate here (as opposed to nextTick of queurMicroTask) because incoming
                // messages are dispatched via setImmediate. This allows us to collect multiple such messages.
                setImmediate(() => {
                    this.doSendBatch(receiver);
                });
            }
        }

        items.messages.push({ buffer: msg, handler: onError });
        items.len += msg.length;

        if (willExceedMaxSize) {
            // When the buffer size (including our newly added message) is larger than the
            // threshold, immediately (synchronously) send the batch.
            this.doSendBatch(receiver);
        }
    }

    // Sends out a batch. Does not return anything, and does not raise
    // exceptions. As a side effect, removes the batch from the sendqueue for the specified receiver.
    protected doSendBatch(receiver: string) {
        const items = this.sendQueue.get(receiver);
        this.sendQueue.delete(receiver);

        if (items === undefined || items.len === 0) {
            return;
        }

        deeper('io.darlean.nats.send-batch', receiver).performSync(() => {
            const lengths = items.messages.map((msg) => msg.buffer.length.toString()).join(',') + '\n';
            const buffer = Buffer.concat([Buffer.from(lengths, 'ascii'), ...items.messages.map((msg) => msg.buffer)]);
            if (!this.connection) {
                const e = new Error(NATS_ERROR_NOT_CONNECTED);
                for (const item of items.messages) {
                    item.handler(e);
                }
                return;
            }
            this.connection
                .request(receiver, buffer, {
                    timeout: this.ackTimeout || 4000
                })
                .catch((e) => {
                    for (const item of items.messages) {
                        item.handler(e);
                    }
                });
        });
    }

    // TODO: Do not send "respond" for a reply (and also do not expect a respond to prevent timeouts)

    protected handleMessage(_err: unknown, m: Msg, onMessage: MessageHandler) {
        try {
            const data = Buffer.from(m.data);
            // We deliberately DID do not send a response ("m.respond()") because the sender does not need this information.
            // It would just cost us additional network traffic.
            // BUT. It appears that during startup, messages may get lost.
            // Performance tests did not show a significant drop.
            // In addition to that, we only do this once per batch of messages (so not for each
            // individual message).
            deeper('io.darlean.nats.send-ack').performSync(() => m.respond());

            const p = data.indexOf(BUF_NEWLINE);
            if (p < 0) {
                throw new Error('Corrupt data');
            }
            const h = data.toString('ascii', 0, p);
            const lengths = h.split(',').map((x) => parseInt(x));

            let offset = p + 1;
            for (const len of lengths) {
                const message = data.subarray(offset, offset + len);
                offset += len;
                try {
                    const msg = deserialize(message, this.deser);
                    if (!msg) {
                        continue;
                    }

                    const traceInfo: ITraceInfo | undefined =
                        msg.tracing_cids || msg.tracing_parentUid
                            ? {
                                  correlationIds: msg.tracing_cids || [],
                                  parentSegmentId: msg.tracing_parentUid
                              }
                            : undefined;

                    deeper('io.darlean.nats.received-message', undefined, undefined, traceInfo).performSync(() => {
                        deeper('io.darlean.nats.call-message-handler').performSync(() => onMessage(msg));
                    });
                } catch (e) {
                    currentScope().error('Error during handling of incoming message: [Error]', () => ({
                        Error: e
                    }));
                }
            }
        } catch (e) {
            currentScope().error('Error during handling of incoming message batch: [Error]', () => ({
                Error: e
            }));
        }
    }

    protected async listen(sub: Subscription, onMessage: MessageHandler) {
        try {
            for await (const m of sub) {
                this.handleMessage(undefined, m, onMessage);
            }
        } catch (e) {
            console.log('Error during listen', e);
            // Panic!!
            throw e;
        }
    }

    protected sendFailureMessage(originalTags: ITransportTags & IRemoteCallTags, code: string, msg: string) {
        const failure: ITransportFailure = {
            code,
            message: msg
        };

        if (originalTags.transport_return) {
            const tags: ITransportTags & IRemoteCallTags = {
                transport_receiver: originalTags.transport_return,
                remotecall_id: originalTags.remotecall_id,
                remotecall_kind: 'return'
            };
            deeper('io.darlean.nats.send-failure-message').performSync(() => this.send(tags, undefined, failure));
        }
    }
}
