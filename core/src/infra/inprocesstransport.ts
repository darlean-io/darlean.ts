import { IDeSer } from '@darlean/utils';
import { ITransportFailure, ITransport, MessageHandler, ITransportSession } from './transport';
import { IRemoteCallTags, ITransportTags, TRANSPORT_ERROR_UNKNOWN_RECEIVER } from './wiretypes';

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

    public async send(tags: ITransportTags & IRemoteCallTags, contents: unknown, failure?: ITransportFailure): Promise<void> {
        const client = this.clients.get(tags.transport_receiver);

        if (client) {
            try {
                client.onMessage({ ...tags, ...(contents as object), ...failure });
                return;
            } catch (e) {
                console.log(e); // TODO
            }
        } else {
            this.sendFailureMessage(
                tags,
                TRANSPORT_ERROR_UNKNOWN_RECEIVER,
                `Receiver [${tags.transport_receiver}] is not registered to the in-process transport (only ${JSON.stringify(
                    Array.from(this.clients.keys())
                )} is/are registered)`
            );
        }
    }

    public async finalize(): Promise<void> {
        this.clients.delete(this.appId);
    }

    protected sendFailureMessage(originalTags: ITransportTags & IRemoteCallTags, code: string, msg: string) {
        if (originalTags.transport_return) {
            const failure: ITransportFailure = {
                code,
                message: msg
            };

            const tags: ITransportTags & IRemoteCallTags = {
                transport_receiver: originalTags.transport_return,
                remotecall_id: originalTags.remotecall_id,
                remotecall_kind: 'return'
            };
            this.send(tags, undefined, failure);
        }
    }
}
