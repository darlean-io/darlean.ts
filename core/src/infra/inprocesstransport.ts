import { IDeSer } from '@darlean/utils';
import {
    ITransportFailure,
    ITransport,
    ITransportEnvelope,
    MessageHandler,
    ITransportSession,
    TRANSPORT_ERROR_UNKNOWN_RECEIVER
} from './transport';

interface IClient {
    appId: string;
    onMessage: MessageHandler;
}

/**
 * Implements an {@link ITransport} for in-process use (does not support inter-process communication) with support for multiple
 * apps within the current process.
 */
export class InProcessTransport implements ITransport {
    protected clients: Map<string, IClient>;
    protected deser: IDeSer;

    constructor(deser: IDeSer) {
        this.deser = deser;
        this.clients = new Map();
    }

    public async connect(appId: string, onMessage: MessageHandler): Promise<ITransportSession> {
        this.clients.set(appId, {
            appId,
            onMessage
        });
        return new InProcessTransportSession(this.clients, this.deser, appId);
    }
}

export class InProcessTransportSession implements ITransportSession {
    protected appId: string;
    protected clients: Map<string, IClient>;
    protected deser: IDeSer;

    constructor(clients: Map<string, IClient>, deser: IDeSer, appId: string) {
        this.appId = appId;
        this.clients = clients;
        this.deser = deser;
    }

    public async send(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): Promise<void> {
        const client = this.clients.get(envelope.receiverId);

        if (client) {
            try {
                const c = contents === undefined ? undefined : this.deser.deserialize(this.deser.serialize(contents));
                const f = failure === undefined ? undefined : this.deser.deserialize(this.deser.serialize(failure));

                client.onMessage(envelope, c, f as ITransportFailure | undefined);
                return;
            } catch (e) {
                console.log(e); // TODO
            }
        } else {
            this.sendFailureMessage(
                envelope,
                TRANSPORT_ERROR_UNKNOWN_RECEIVER,
                `Receiver [${envelope.receiverId}] is not registered to the in-process transport (only ${JSON.stringify(
                    Array.from(this.clients.keys())
                )} is/are registered)`
            );
        }
    }

    public async finalize(): Promise<void> {
        this.clients.delete(this.appId);
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
