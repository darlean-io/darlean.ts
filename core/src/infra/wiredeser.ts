/**
 * Provides serialization and deserialization for over-the-wire Darlean messages.
 *
 * Uses the serialization as provided in {@link @darlean/core/fastproto}.
 *
 * ## Format of messages
 *
 * Messages consist of the following list of fields written after each other to a buffer:
 * * MajorVersion - Character ('0' for now)
 * * MinorVersion - Character ('0' for now)
 * * TransportReceiver - String
 * * TransportReturn - String
 * * TransportFailureCode - String
 * * TransportFailureMessage - String
 * * TracingCids - Variant
 * * TracingTags - String
 * * RemoteCallId - String
 * * RemoteCallKind - Character 'c' (call) or 'r' (return)
 * * CallRequestLazy - Character 't' (true) or 'f' (false)
 * * CallRequestActorType - String
 * * CallRequestActionName - String
 * * CallRequestActorIdNumberParts - UInt
 * * CallRequestActorIdPart* - String (for each part)
 * * CallRequestArgumentsCount - UInt
 * * CallRequestArgument* - Variant (for each arg)
 * * CallResponseResult - Variant
 * * CallResponseError - Json
 *
 * ## Notes
 * * Implementations must not continue when the received major version is larger than their own supported major version.
 */
import { IActionError, IActorCallRequest, IActorCallResponse } from '@darlean/base';
import { ITransportFailure } from './transport';
import {
    IProtoInsertion,
    IBufWithCursor,
    IDeSer,
    readUnsignedInt,
    writeUnsignedInt,
    FastProtoWriter,
    FastProtoReader
} from '@darlean/utils';
import { ITracingTags, IRemoteCallTags, ITransportTags } from './wiretypes';

const CHAR_CODE_RETURN = 'r'.charCodeAt(0);
const CHAR_CODE_CALL = 'c'.charCodeAt(0);

const CHAR_CODE_FALSE = 'f'.charCodeAt(0);
const CHAR_CODE_TRUE = 't'.charCodeAt(0);

/**
 * Maximum total size the tags for a message may have. The content of structured fields
 * (that are represented as JSON) and of buffers do not count against this limit.
 */
const MAX_MSG_BODY_SIZE = 32768;

const CHAR_CODE_VERSION_MAJOR = '0'.charCodeAt(0);
const CHAR_CODE_VERSION_MINOR = '0'.charCodeAt(0);

function addParts<T>(parts: T[] | undefined, addPart: (value: T) => void) {
    if (!parts) {
        return;
    }

    const len = parts.length;
    if (len === 0) {
        // Do nothing
    } else if (len === 1) {
        addPart(parts[0]);
    } else if (len === 2) {
        addPart(parts[0]);
        addPart(parts[1]);
    } else {
        for (const part of parts) {
            addPart(part);
        }
    }
}

const STATIC_BUFFER = Buffer.alloc(MAX_MSG_BODY_SIZE);

/**
 * Serializes a set of tags into a Buffer.
 * @param value The set of tags to be serialized
 * @param deser Serializer that is used when serializing structured data
 * @returns A buffer containing the serialized data.
 */
export function serialize(
    value: ITracingTags & ITransportTags & IRemoteCallTags & (IActorCallRequest | IActorCallResponse | ITransportFailure | never),
    deser: IDeSer
): Buffer {
    const buf: IBufWithCursor = { buffer: STATIC_BUFFER, cursor: 0 };
    let insertions: IProtoInsertion[] | undefined;

    function addInsertion(insertion: IProtoInsertion | undefined) {
        if (insertion === undefined) {
            return;
        }
        if (insertions === undefined) {
            insertions = [insertion];
        } else {
            insertions.push(insertion);
        }
    }

    FastProtoWriter.writeChar(buf, CHAR_CODE_VERSION_MAJOR);
    FastProtoWriter.writeChar(buf, CHAR_CODE_VERSION_MINOR);

    // Transport
    FastProtoWriter.writeString(buf, value.transport_receiver);
    FastProtoWriter.writeString(buf, value.transport_return);

    // Transport Failure
    FastProtoWriter.writeString(buf, (value as ITransportFailure).code);
    FastProtoWriter.writeString(buf, (value as ITransportFailure).message);

    // Tracing
    addInsertion(FastProtoWriter.writeVariant(buf, deser, (value as ITracingTags).tracing_cids));
    FastProtoWriter.writeString(buf, (value as ITracingTags).tracing_parentUid);

    // Remote call
    FastProtoWriter.writeString(buf, value.remotecall_id);
    FastProtoWriter.writeChar(buf, value.remotecall_kind === 'return' ? CHAR_CODE_RETURN : CHAR_CODE_CALL);

    // Call Request
    FastProtoWriter.writeChar(buf, (value as IActorCallRequest).lazy ? CHAR_CODE_TRUE : CHAR_CODE_FALSE);
    FastProtoWriter.writeString(buf, (value as IActorCallRequest).actorType);
    FastProtoWriter.writeString(buf, (value as IActorCallRequest).actionName);
    writeUnsignedInt(buf, (value as IActorCallRequest).actorId ? (value as IActorCallRequest).actorId.length : 0);
    addParts((value as IActorCallRequest).actorId, (value) => FastProtoWriter.writeString(buf, value));
    writeUnsignedInt(buf, (value as IActorCallRequest).arguments ? (value as IActorCallRequest).arguments.length : 0);
    addParts((value as IActorCallRequest).arguments, (value) => {
        addInsertion(FastProtoWriter.writeVariant(buf, deser, value));
    });

    // Call Response
    addInsertion(FastProtoWriter.writeVariant(buf, deser, (value as IActorCallResponse).result));
    addInsertion(FastProtoWriter.writeJson(buf, deser, (value as IActorCallResponse).error));

    if (insertions === undefined) {
        const headerBuf = buf.buffer.subarray(0, buf.cursor);
        return Buffer.from(headerBuf);
    }

    // Mix insertions in main buffer
    const buffers: Buffer[] = [];
    let position = 0;
    for (const insertion of insertions) {
        buffers.push(buf.buffer.subarray(position, insertion.offset));
        buffers.push(insertion.data);
        position = insertion.offset;
    }
    // Warning: Do NOT take buf.length here, as the buffer
    // itself is much larger than the content
    if (position < buf.cursor) {
        buffers.push(buf.buffer.subarray(position, buf.cursor));
    }
    const resultbuf = Buffer.concat(buffers);
    return resultbuf;
}

/**
 * Deserializes a binary chunk of data that was previously serialized with {@link serialize}.
 * @param value The buffer to be deserialized.
 * @param deser The deserializer to be used for deserializing structured data elements.
 * @returns The deserialized set of tags.
 */
export function deserialize(
    value: Buffer,
    deser: IDeSer
): ITracingTags & ITransportTags & IRemoteCallTags & (IActorCallRequest | IActorCallResponse | ITransportFailure | never) {
    const buf: IBufWithCursor = { buffer: value, cursor: 0 };

    const result = {};

    // Major version number
    const major = FastProtoReader.readChar(buf);
    if (major > CHAR_CODE_VERSION_MAJOR) {
        throw new Error(
            `Unsupported major version ${String.fromCharCode(major)}. We support up to version ${String.fromCharCode(
                CHAR_CODE_VERSION_MAJOR
            )}.`
        );
    }

    // Minor version number.
    // Ignore for now. Future implementations can use it to parse the contents differently.
    FastProtoReader.readChar(buf);

    // Transport
    (result as ITransportTags).transport_receiver = FastProtoReader.readString(buf) || '';
    (result as ITransportTags).transport_return = FastProtoReader.readString(buf);

    // Transport Failure
    (result as ITransportFailure).code = FastProtoReader.readString(buf) as string;
    (result as ITransportFailure).message = FastProtoReader.readString(buf) as string;

    // Tracing
    (result as ITracingTags).tracing_cids = FastProtoReader.readVariant(buf, deser) as string[] | undefined;
    (result as ITracingTags).tracing_parentUid = FastProtoReader.readString(buf);

    // Remote call
    (result as IRemoteCallTags).remotecall_id = FastProtoReader.readString(buf) || '';
    (result as IRemoteCallTags).remotecall_kind = FastProtoReader.readChar(buf) === CHAR_CODE_RETURN ? 'return' : 'call';

    // Call request
    (result as IActorCallRequest).lazy = FastProtoReader.readChar(buf) === CHAR_CODE_TRUE;
    (result as IActorCallRequest).actorType = FastProtoReader.readString(buf) as string;
    (result as IActorCallRequest).actionName = FastProtoReader.readString(buf) as string;
    const idPartCount = readUnsignedInt(buf);

    // Call request - Actor id parts
    if (idPartCount === 0) {
        if ((result as IActorCallRequest).actorType !== undefined) {
            (result as IActorCallRequest).actorId = [];
        }
    } else if (idPartCount === 1) {
        (result as IActorCallRequest).actorId = [FastProtoReader.readString(buf) ?? ''];
    } else if (idPartCount === 2) {
        (result as IActorCallRequest).actorId = [FastProtoReader.readString(buf) ?? '', FastProtoReader.readString(buf) ?? ''];
    } else {
        const parts: string[] = [];
        for (let i = 0; i < idPartCount; i++) {
            parts.push(FastProtoReader.readString(buf) ?? '');
        }
        (result as unknown as IActorCallRequest).actorId = parts;
    }

    const argCount = readUnsignedInt(buf);

    // Call request - Arguments
    if (argCount === 0) {
        if ((result as IActorCallRequest).actorType !== undefined) {
            (result as IActorCallRequest).arguments = [];
        }
    } else if (argCount === 1) {
        (result as IActorCallRequest).arguments = [FastProtoReader.readVariant(buf, deser)];
    } else if (argCount === 2) {
        (result as IActorCallRequest).arguments = [
            FastProtoReader.readVariant(buf, deser),
            FastProtoReader.readVariant(buf, deser)
        ];
    } else {
        const args: unknown[] = [];
        for (let i = 0; i < argCount; i++) {
            args.push(FastProtoReader.readVariant(buf, deser));
        }
        (result as IActorCallRequest).arguments = args;
    }

    // Call response
    (result as IActorCallResponse).result = FastProtoReader.readVariant(buf, deser);
    (result as IActorCallResponse).error = FastProtoReader.readJson(buf, deser) as IActionError | undefined;

    return result as ITracingTags &
        ITransportTags &
        IRemoteCallTags &
        (IActorCallRequest | IActorCallResponse | ITransportFailure | never);
}
