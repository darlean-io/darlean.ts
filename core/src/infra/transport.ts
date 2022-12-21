import { IEnvelope } from './envelope';

export interface ITransportEnvelope extends IEnvelope {
    receiverId: string;
    returnEnvelopes?: ITransportEnvelope[];
}

export type MessageHandler = (envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure) => void;

export interface ITransport {
    connect(appId: string, onMessage: MessageHandler): Promise<ITransportSession>;
}

export interface ITransportSession {
    /**
     * Triggers sending of envelope with specified contents. Returns immediately (envelope
     * may or may not yet have been sent). Must never raise an exception. Exceptions should
     * be sent to the failureEnvelopes when present in the envelope.
     * @param envelope The envelope thast must be sent
     * @param contents The contents that must be sent
     * @param failure Optional failure. Either contents or failure must be present, but not both.
     */
    send(envelope: ITransportEnvelope, contents: unknown, failure?: ITransportFailure): void;

    finalize(): Promise<void>;
}

export interface ITransportFailure {
    code: string;
    message: string;
}
