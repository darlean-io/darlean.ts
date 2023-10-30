/**
 * Provides fast and space efficient serialization and deserialization protocol primitives intended for over-the-wire messages.
 * It is about 2-10 times faster than plain `JSON.stringify` + `JSON.parse` (see the corresponding unit test for fastproto).
 *
 * Because of performance reasons, we have implemented this binary (but still ascii-ish so humanly decipherable) protocol.
 * It is very efficient in terms of space and processing time.
 *
 * Why not Protobuf? According to the benchmark at https://github.com/bojand/protocol-buffers-benchmarks (with updated
 * packages for the protobuf libraries), protobuf has about the same performance of JSON parse/stringify, which is significantly
 * slower than FastProto.
 *
 * # Specification
 *
 * ## Data types
 *
 * * `UInt` unsigned integer numbers are serialized via the format as described in {@link writeUnsignedInt}.
 * * `Strings` consist of a UInt of the length, followed by the contents as utf8.
 * * `Characters` are just the ascii character (1 byte)
 * * `Json` consists of a UInt of the length followed by the serialized string in utf8.
 * * `Binary` consists of a UInt of the length followed by the raw bytes
 * * `Variant` consists of a Character that indicates the type, followed by the contents.
 *
 * ## Variants
 *
 * Variants are encoded as follows:
 *
 * * Buffers start with `'b'` followed by a `Binary`
 * * Boolean `false` is `'f'`.
 * * JSON starts with `'j'` followed by a `Json`.
 * * Numbers (int, float, signed, unsigned) start with `'n'` followed by a `String` with content `value.toString()`.
 * * Strings start with `'s'` followed by a `String` with the contents.
 * * Boolean `true` is `'t'`.
 * * Undefined is `'u'`.
 *
 * Only when one of the other encodings is not applicable, the JSON encoding is used.
 *
 */

import { IBufWithCursor } from './bufferwithcursor';
import { IDeSer } from './deser';
import { readUnsignedInt, writeUnsignedInt } from './numbers';

const CHAR_CODE_BUFFER = 'b'.charCodeAt(0);
const CHAR_CODE_FALSE = 'f'.charCodeAt(0);
const CHAR_CODE_JSON = 'j'.charCodeAt(0);
const CHAR_CODE_NUMBER = 'n'.charCodeAt(0);
const CHAR_CODE_STRING = 's'.charCodeAt(0);
const CHAR_CODE_TRUE = 't'.charCodeAt(0);
const CHAR_CODE_UNDEFINED = 'u'.charCodeAt(0);

export interface IProtoInsertion {
    offset: number;
    data: Buffer;
}

export const FastProtoWriter = {
    writeString,
    writeChar,
    writeBinary,
    writeJson,
    writeVariant,
    writeUnsignedInt
};

export const FastProtoReader = {
    readString,
    readChar,
    readBinary,
    readJson,
    readUnsignedInt,
    readVariant
};

function writeString(buf: IBufWithCursor, value: string | undefined) {
    if (value === undefined || value.length === 0) {
        return writeUnsignedInt(buf, 0);
    }
    writeUnsignedInt(buf, value.length);
    buf.buffer.write(value, buf.cursor, 'utf8');
    buf.cursor += value.length;
}

function readString(buf: IBufWithCursor): string | undefined {
    const len = readUnsignedInt(buf);
    if (len === 0) {
        return undefined;
    }
    const cursor = buf.cursor;
    buf.cursor += len;
    return buf.buffer.toString('utf8', cursor, cursor + len);
}

function writeChar(buf: IBufWithCursor, value: number) {
    const buffer = buf.buffer;
    const cursor = buf.cursor;
    buffer[cursor] = value;
    buf.cursor = cursor + 1;
}

function readChar(buf: IBufWithCursor): number {
    const buffer = buf.buffer;
    const cursor = buf.cursor;
    buf.cursor = cursor + 1;
    return buffer[cursor];
}

function writeBinary(buf: IBufWithCursor, value: Buffer | undefined): IProtoInsertion | undefined {
    if (value === undefined || value.length === 0) {
        writeUnsignedInt(buf, 0);
        return;
    }
    writeUnsignedInt(buf, value.length);
    return { offset: buf.cursor, data: value };
}

function readBinary(buf: IBufWithCursor): Buffer {
    const len = readUnsignedInt(buf);
    if (len === 0) {
        return Buffer.alloc(0);
    }
    const sub = buf.buffer.subarray(buf.cursor, buf.cursor + len);
    buf.cursor += len;
    return Buffer.from(sub);
}

function writeJson(buf: IBufWithCursor, deser: IDeSer, value: unknown): IProtoInsertion | undefined {
    if (value === undefined) {
        writeUnsignedInt(buf, 0);
        return;
    }

    const content = deser.serialize(value);
    writeUnsignedInt(buf, content.length);
    return { offset: buf.cursor, data: content };
}

function readJson(buf: IBufWithCursor, deser: IDeSer): unknown {
    const len = readUnsignedInt(buf);
    if (len === 0) {
        return undefined;
    }
    const content = buf.buffer.subarray(buf.cursor, buf.cursor + len);
    buf.cursor += len;
    return deser.deserialize(content, { copyBuffers: true });
}

function writeVariant(buf: IBufWithCursor, deser: IDeSer, value: unknown): IProtoInsertion | undefined {
    switch (typeof value) {
        case 'undefined':
            writeChar(buf, CHAR_CODE_UNDEFINED);
            break;
        case 'string':
            writeChar(buf, CHAR_CODE_STRING);
            writeString(buf, value);
            break;
        case 'number':
            writeChar(buf, CHAR_CODE_NUMBER);
            writeString(buf, value.toString());
            break;
        case 'boolean':
            writeChar(buf, value ? CHAR_CODE_TRUE : CHAR_CODE_FALSE);
            break;
        case 'object':
            if (Buffer.isBuffer(value)) {
                writeChar(buf, CHAR_CODE_BUFFER);
                return writeBinary(buf, value);
            } else {
                writeChar(buf, CHAR_CODE_JSON);
                return writeJson(buf, deser, value);
            }
            break;
        default:
            writeChar(buf, CHAR_CODE_JSON);
            return writeJson(buf, deser, value);
    }
}

function readVariant(buf: IBufWithCursor, deser: IDeSer): unknown {
    const kind = readChar(buf);
    switch (kind) {
        case CHAR_CODE_UNDEFINED:
            return undefined;
        case CHAR_CODE_STRING:
            return readString(buf);
        case CHAR_CODE_NUMBER:
            return parseFloat(readString(buf) ?? '0');
        case CHAR_CODE_JSON:
            return readJson(buf, deser);
        case CHAR_CODE_FALSE:
            return false;
        case CHAR_CODE_TRUE:
            return true;
        case CHAR_CODE_BUFFER:
            return readBinary(buf);
        default:
            throw new Error('Invalid kind: ' + String.fromCharCode(kind));
    }
}
