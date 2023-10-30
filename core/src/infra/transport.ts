import { IActorCallRequest, IActorCallResponse } from '@darlean/base';
import { IRemoteCallTags, ITransportTags } from './wiretypes';

export type MessageHandler = (tags: ITransportTags & IRemoteCallTags) => void;

export interface ITransport {
    connect(appId: string, onMessage: MessageHandler): Promise<ITransportSession>;
}

export interface ITransportSession {
    /**
     * Triggers sending of tags with specified contents. Returns immediately (tags
     * may or may not yet have been sent). Must never raise an exception. Exceptions should
     * be sent to the return-field when present in the tags.
     * @param tags The tags thast must be sent
     * @param contents The contents that must be sent
     * @param failure Optional failure. Either contents or failure must be present, but not both.
     */
    send(
        tags: ITransportTags,
        contents: IActorCallRequest | IActorCallResponse | ITransportFailure | undefined,
        failure?: ITransportFailure
    ): void;

    finalize(): Promise<void>;
}

export interface ITransportFailure {
    code: string;
    message: string;
}
