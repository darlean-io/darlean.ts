import { nextTick } from 'process';
import { IDeSer } from './deser';
import { ITransportFailure, ITransport, ITransportEnvelope, MessageHandler, ITransportSession } from './transport';
import { connect, ErrorCode, NatsConnection, NatsError, Subscription } from 'nats';

export const NATS_ERROR_NOT_CONNECTED = 'NOT_CONNECTED';
export const NATS_ERROR_UNKNOWN_RECEIVER = 'UNKNOWN_RECEIVER';
export const NATS_ERROR_SEND_FAILED = 'SEND_FAILED';

export interface INatsMessage {
    envelope: ITransportEnvelope;
    contents?: Buffer;
    failure?: Buffer;
}

export class NatsTransport implements ITransport {
    protected deser: IDeSer;
    protected connection?: NatsConnection;
    protected subscription?: Subscription;

    constructor(deser: IDeSer) {
        this.deser = deser;
    }

    public async connect(appId: string, onMessage: MessageHandler): Promise<ITransportSession> {
        const session = new NatsTransportSession(this.deser);
        await session.connect(appId, onMessage);
        return session;
    }
}

export class NatsTransportSession implements ITransportSession {
    protected deser: IDeSer;
    protected connection?: NatsConnection;
    protected subscription?: Subscription;
    protected appId?: string;
    protected messageHandler?: MessageHandler;

    constructor(deser: IDeSer) {
        this.deser = deser;
    }

    public async connect(appId: string, onMessage: MessageHandler): Promise<void> {
        this.appId = appId;
        this.messageHandler = onMessage;
        this.connection = await connect({ waitOnFirstConnect: true, maxReconnectAttempts: -1 });
        const subscription = this.connection.subscribe(appId);
        this.subscription = subscription;
        nextTick(async () => await this.listen(subscription, onMessage));
    }

    public async send(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): Promise<void> {
        if (envelope.receiverId == this.appId) {
            // Bypass NATS. That is not just a performance optimization. It also ensures that when the error situation is that
            // NATS is not available (like, NATS server not running), the error is properly fed back to the calling code.
            this.messageHandler?.(envelope, contents, failure); 
            return;
        }

        if (!this.connection) {
            this.sendFailureMessage(envelope, 'SEND_ERROR', `Unable to send to  [${envelope.receiverId}]: [${NATS_ERROR_NOT_CONNECTED}]`);
            return;
        }

        const msg: INatsMessage = {
            envelope,
            contents: contents === undefined ? undefined : this.deser.serialize(contents),
            failure: failure === undefined ? undefined : this.deser.serialize(failure)
        };
        try {
            await this.connection?.request(envelope.receiverId, this.deser.serialize(msg));
        } catch (e) {
            const ne = e as NatsError;
            if (ne.code === ErrorCode.NoResponders) {
                this.sendFailureMessage(
                    envelope,
                    NATS_ERROR_UNKNOWN_RECEIVER,
                    `Receiver [${envelope.receiverId}] is not registered to the nats transport`
                );
            } else if (ne.code === ErrorCode.Timeout) {
                // It is normal to receive a timeout, because we do not send back a reply when we receive a message
                // (that to avoid an unnecessary round trip). We have our own timeout mechanism that will fire when anything
                // else goes wrong. So, we can just ignore the timeout.
            } else {
                console.log('Error during nats send:', e);
                this.sendFailureMessage(envelope, NATS_ERROR_SEND_FAILED, `Unable to send to  [${envelope.receiverId}]: [${e}]`);
            }
        }
    }

    public async finalize(): Promise<void> {
        await this.subscription?.drain();
        await this.connection?.close();
    }

    protected async listen(sub: Subscription, onMessage: MessageHandler) {
        try {
            for await (const m of sub) {
                const data = m.data;

                // We deliberately do not send a response ("m.respond()") because the sender does not need this information.
                // It would just cost us additional network traffic.

                const msg = this.deser.deserialize(Buffer.from(data)) as INatsMessage;
                const contents = msg.contents ? this.deser.deserialize(msg.contents) : undefined;
                const failure = msg.failure ? (this.deser.deserialize(msg.failure) as ITransportFailure) : undefined;

                onMessage(msg.envelope, contents, failure);
            }
        } catch (e) {
            console.log('Error during listen', e);
        }
    }

    protected sendFailureMessage(originalEnv: ITransportEnvelope, code: string, msg: string) {
        const failure: ITransportFailure = {
            code,
            message: msg
        };

        if (originalEnv.returnEnvelopes) {
            for (const env of originalEnv.returnEnvelopes) {
                this.send(env, undefined, failure);
            }
        }
    }
}
