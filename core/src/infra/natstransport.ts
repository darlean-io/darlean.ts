import {
    ITransportFailure,
    ITransport,
    ITransportEnvelope,
    MessageHandler,
    ITransportSession,
    TRANSPORT_ERROR_UNKNOWN_RECEIVER
} from './transport';
import { connect, ErrorCode, Msg, NatsConnection, NatsError, Subscription } from 'nats';
import { currentScope, deeper, IDeSer, ITraceInfo } from '@darlean/utils';

export const NATS_ERROR_NOT_CONNECTED = 'NOT_CONNECTED';
export const NATS_ERROR_SEND_FAILED = 'SEND_FAILED';
export const NATS_ERROR_SEND_NO_ACK = 'NO_ACK';

const ACK_TIMEOUT = 4000;

// const MAX_MSG_SIZE = 100 * 1000 * 1000;

export interface INatsMessage {
    envelope: ITransportEnvelope;
    contents?: Buffer;
    failure?: Buffer;
    cids?: string[];
    parentUid?: string;
}

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

    public async send(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): Promise<void> {
        if (envelope.receiverId == this.appId) {
            // Bypass NATS. That is not just a performance optimization. It also ensures that when the error situation is that
            // NATS is not available (like, NATS server not running), the error is properly fed back to the calling code.
            deeper('io.darlean.nats.bypass-nats').performSync(() => this.messageHandler?.(envelope, contents, failure));
            return;
        }

        if (!this.connection) {
            this.sendFailureMessage(
                envelope,
                'SEND_ERROR',
                `Unable to send to  [${envelope.receiverId}]: [${NATS_ERROR_NOT_CONNECTED}]`
            );
            return;
        }

        const scope = currentScope();
        const cids = scope.getCorrelationIds();

        const msg: INatsMessage = {
            envelope,
            contents: contents === undefined ? undefined : this.deser.serialize(contents),
            failure: failure === undefined ? undefined : this.deser.serialize(failure),
            cids,
            parentUid: cids === undefined ? undefined : scope.getUid()
        };

        //if ((msg.contents?.length ?? 0) > MAX_MSG_SIZE) {
        //    this.sendFailureMessage(envelope, NATS_ERROR_SEND_FAILED, `Unable to send to  [${envelope.receiverId}]: Serialized message too large`);
        //}

        try {
            await deeper('io.darlean.nats.send', envelope.receiverId).perform(() =>
                this.sendImpl(envelope.receiverId, this.deser.serialize(msg))
            );
        } catch (e) {
            const ne = e as NatsError;
            if (ne.code === ErrorCode.NoResponders) {
                this.sendFailureMessage(
                    envelope,
                    TRANSPORT_ERROR_UNKNOWN_RECEIVER,
                    `Receiver [${envelope.receiverId}] is not registered to the nats transport`
                );
            } else if (ne.code === ErrorCode.Timeout) {
                // It USED TO BE normal to receive a timeout, because we do not send back a reply when we receive a message
                // (that to avoid an unnecessary round trip). We have our own timeout mechanism that will fire when anything
                // else goes wrong. So, we can just ignore the timeout.
                // But we enabled the ack-mechanism ("m.respond()"), so now a timeout is really a signal that something is wrong
                // and that the receiver did not receive the message,
                if (this.ackTimeout > 0) {
                    this.sendFailureMessage(
                        envelope,
                        NATS_ERROR_SEND_NO_ACK,
                        `No ack received after sending to  [${envelope.receiverId}]: [${e}]`
                    );
                }
            } else {
                console.log('Error during nats send:', e, envelope.receiverId);
                this.sendFailureMessage(envelope, NATS_ERROR_SEND_FAILED, `Unable to send to  [${envelope.receiverId}]: [${e}]`);
            }
        }
    }

    public async finalize(): Promise<void> {
        await this.subscription?.drain();
        await this.connection?.close();
    }

    protected async sendImpl(receiver: string, msg: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            let items = this.sendQueue.get(receiver);
            if (!items) {
                items = { receiver, messages: [], len: 0 };
                process.nextTick(() => {
                    const items2 = this.sendQueue.get(receiver);
                    if (items2) {
                        this.sendQueue.delete(receiver);
                        this.doSendBatch(receiver, items2);
                    }
                });
                this.sendQueue.set(receiver, items);
            }
            const item: ISendItem = {
                buffer: msg,
                handler: (err) => {
                    if (err) {
                        reject(err);
                    }
                    resolve();
                }
            };
            if (items.len + msg.length >= 10000) {
                this.sendQueue.delete(receiver);
                const items2 = items;
                process.nextTick(() => {
                    if (items) {
                        this.doSendBatch(receiver, items2);
                    }
                });
                items = { receiver, messages: [], len: 0 };
                this.sendQueue.set(receiver, items);    
            }
            items.messages.push(item);
            items.len += msg.length;
        });
    }

    protected async doSendBatch(receiver: string, items: ISendItems) {
        try {
            await deeper('io.darlean.nats.send-batch', receiver).perform(() => {
                const buffer = this.deser.serialize(items.messages.map((msg) => msg.buffer));
                if (!this.connection) {
                    throw new Error(NATS_ERROR_NOT_CONNECTED);
                }
                return this.connection.request(receiver, buffer, {
                    timeout: this.ackTimeout || 4000
                });
            });
            for (const item of items.messages) {
                item.handler(undefined);
            }
        } catch (e) {
            for (const item of items.messages) {
                item.handler(e);
            }
        }
    }

    protected handleMessage(_err: unknown, m: Msg, onMessage: MessageHandler) {
        try {
            const data = m.data;

            const messages = this.deser.deserialize(Buffer.from(data)) as Buffer[];
            for (const message of messages) {
                try {
                    const msg = this.deser.deserialize(message) as INatsMessage;

                    const traceInfo: ITraceInfo | undefined =
                        msg.cids || msg.parentUid
                            ? {
                                  correlationIds: msg.cids || [],
                                  parentSegmentId: msg.parentUid
                              }
                            : undefined;
                    deeper('io.darlean.nats.received-message', undefined, undefined, traceInfo).performSync(() => {
                        // We deliberately DID do not send a response ("m.respond()") because the sender does not need this information.
                        // It would just cost us additional network traffic.
                        // BUT. It appears that during startup, messages may get lost.
                        // Performance tests did not show a significant drop.
                        deeper('io.darlean.nats.send-ack').performSync(() => m.respond());

                        const contents = msg.contents ? this.deser.deserialize(msg.contents) : undefined;
                        const failure = msg.failure ? (this.deser.deserialize(msg.failure) as ITransportFailure) : undefined;

                        deeper('io.darlean.nats.call-message-handler').performSync(() =>
                            onMessage(msg.envelope, contents, failure)
                        );
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

    protected sendFailureMessage(originalEnv: ITransportEnvelope, code: string, msg: string) {
        const failure: ITransportFailure = {
            code,
            message: msg
        };

        if (originalEnv.returnEnvelopes) {
            for (const env of originalEnv.returnEnvelopes) {
                deeper('io.darlean.nats.send-failure-message').perform(() => this.send(env, undefined, failure));
            }
        }
    }
}
