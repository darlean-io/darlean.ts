/**
 * Contains types and classes for performing "JsonBinary" serialization and deserialization.
 *
 * JsonBinary (JB) is an encoding that is performance-efficient, space-efficient and human-readable.
 *
 * # Comparison with alternatives:
 *
 * * Plain JSON is space inefficient for encoding binary data (binary data is encoded as array of
 *   byte values: `[123, 124, 125]`).
 * * BSON is 2-10 times slower in NodeJS than plain JSON (see benchmark in unit tests for deser)
 *   and is not human readable.
 * * Mime-Json may reach the performance JsonBinary when optimized further but is much
 *   less space-efficient, especially for small buffer sizes. The mime-headers and the delimiter
 *   strings are quite long. For shorter delimiters, the existence of the delimiters input the data
 *   must be checked, which also takes time.
 *
 * # JB Specification
 *
 * JB consists of:
 * * A header, delimited by newline (`\n`)
 * * The JSON contents, which may contain one or more {@link IContainedBuffer} snippets followed by one newline character (`\n`)
 * * One or more blobs of binary data, each followed by one newline character (`\n').
 *
 * The header consts of semi-colon (`;`) delimited fields:
 * * Version. Currently `JB00`. Third position resembles the major version number. Implementations should not proceed when the
 *   major number is larger than what they support. The fourth position is the minor number. Implementations
 *   must use ascii-comparison to compere these values, so that after '9', we can move on with 'A'..'Z' and
 *   then 'a'..'z' so that we can stick with 1 character per version component.
 * * Seed (optional): a unique string that is included in every `__b` field of the inlined {@link IContainerBuffer} snippets.
 *   This is used to verify that it is indeed a buffer snippet inserted by us (not by accident part of user-provided
 *   JSON that looks like a buffer snippet). May be omitted when there are no buffers.
 * * JSON Length (optional): Length of the JSON snippet. May be omitted when there are no buffers. Does not include the
 *   additional trailing newline character.
 * * Buffer lengths (optional): Comma-separated list of ascii-encoded numbers that indicate the length (in bytes)
 *   of every appended buffer. May be omitted when there are no buffers. The lengths do not include the additional trailing
 *   newline character that must be present after every buffer.
 *
 * After the header comes the JSON body (UTF-8 encoded), which must exactly be as long as the number of bytes
 * indicated in the "JSON Length" header field. The JSON body is followed by one newline character.
 *
 * After the JSON body come the binary blobs. Their sizes must match the sizes in the "Buffer Lengths" header field. After each
 * buffer, a newline character must be present.
 *
 * When a buffer is less then {@link INLINE_BUF_THRESHOLD} in bytes, it is not appended as a separate buffer (and its length is not part of
 * the "Buffer Lengths" header field), but is included as base64 encoded text in the `b64` field of the {@link IContainedBuffer}.
 */
import { BufferOf, IDeSer, IDeserializeOptions } from './deser';
import { isObject } from './util';
import * as crypto from 'crypto';

interface IJBPrimitive {
    _DARLEAN_JB_PRIMITIVE: boolean;
    value: unknown;
}

/**
 * Structure injected in the JSON that indicates that there is binary data at that position
 * in the JSON.
 */
interface IContainedBuffer {
    /**
     * The `__b` field is in indicator that this piece of JSON may contain binary data. The contents
     * of the field is a seed value (a string) which must match with the corresponding header field.
     */
    __b: string;
    /**
     * When present, contains the base64 encoded binary data.
     */
    b64?: string;
}

let convertFunc: ((buffer: Buffer) => unknown) | undefined = undefined;

const NULL_BUF = Buffer.from('null');
const NO_SEED_BUF = Buffer.from('JB00\n');
const JB_HEADER_PREFIX = 'JB00';

const CHARCODE_0 = '0'.charCodeAt(0);
const CHARCODE_J = 'J'.charCodeAt(0);
const CHARCODE_B = 'B'.charCodeAt(0);
const CHARCODE_NEWLINE = '\n'.charCodeAt(0);

const JB_HEADER_PARTIDX_SEED = 1;
const JB_HEADER_PARTIDX_JSON_LENGTH = 2;
const JB_HEADER_PARTIDX_PART_LENGTHS = 3;

/**
 * Binary data shorter than the threshold is represented inline in the JSON as
 * a base64 encoded string. Larger binary data is literally represented (without
 * encoding) as a separate blob.
 */
const INLINE_BUF_THRESHOLD = 64;

const BUF_NEWLINE = Buffer.from('\n');
const NEWLINE_LENGTH = BUF_NEWLINE.length;

/**
 * Serializer/deserializer that uses a binary (albeit human-readable) protocol
 * to store JSON and contained binary data (as Buffers) efficiently, both in
 * terms of used bytes and in terms of CPU time.
 */
export class JBDeSer implements IDeSer {
    public detect(buffer: Buffer): boolean {
        if (buffer.byteLength < 5) {
            return false;
        }

        return buffer[0] === CHARCODE_J && buffer[1] === CHARCODE_B;
    }

    public serialize(value: unknown): Buffer {
        if (isObject(value) && !Buffer.isBuffer(value)) {
            return this.serializeImpl(value);
        } else {
            const v: IJBPrimitive = {
                _DARLEAN_JB_PRIMITIVE: true,
                value
            };
            return this.serializeImpl(v);
        }
    }

    public deserialize(buffer: Buffer, options?: IDeserializeOptions): unknown {
        if (buffer === undefined) {
            return undefined;
        }

        const value = this.deserializeImpl(buffer, options);
        if ((value as IJBPrimitive)._DARLEAN_JB_PRIMITIVE) {
            const prim = (value as IJBPrimitive).value;
            return prim;
        }
        return value;
    }

    public deserializeTyped<T>(buffer: BufferOf<T>): T {
        return this.deserialize(buffer) as T;
    }

    private serializeImpl(value: unknown): Buffer {
        if (convertFunc !== undefined) {
            throw new Error('Serialize cannot (yet) be invoked recursively');
        }
        let seed: string | undefined;
        let parts: Buffer[] | undefined;
        let partsLengths: string[] | undefined;

        // Set the global convertFunc which is invoked during Buffer.toJSON().
        // The convertFunc intercepts these calls, and extracts the buffer
        // informatiopn so that we can use it later.
        convertFunc = function (buffer: Buffer) {
            if (!seed || !parts || !partsLengths) {
                parts = [];
                partsLengths = [];
                seed = nextSeed(10); // 2ms
            }
            if (buffer.length < INLINE_BUF_THRESHOLD) {
                partsLengths.push('');
                if (buffer.length === 0) {
                    return { __b: seed } as IContainedBuffer;
                }
                return { __b: seed, b64: buffer.toString('base64') } as IContainedBuffer;
            }
            parts.push(buffer);
            parts.push(BUF_NEWLINE);
            partsLengths.push(buffer.length.toString());
            const result = { __b: seed } as IContainedBuffer;
            return result;
        };

        try {
            // Strigify the value. When buffer data is encountered, the convertFunc (which is
            // registered as Buffer.toJSON handler, see patchBufferToJSON) will (omonst others)
            // generate a seed. The seed is used to ensure (when deserializing) that a buffer is
            // created by us (and not by accident part of a user-provided JSOn snippet).
            const body = JSON.stringify(value);

            // When there is no seed, that is a signal that there are no buffers in the data.
            // We take a faster shortcut here to directly return a minimal header + the JSON content.
            if (seed === undefined) {
                return Buffer.concat([NO_SEED_BUF, Buffer.from(body, 'utf8')]);
            }

            const header =
                JB_HEADER_PREFIX +
                ';' +
                (seed === undefined ? '' : seed) +
                ';' +
                body.length.toString() +
                ';' +
                (partsLengths === undefined ? '' : partsLengths.join(',')) +
                '\n';

            const headerBuf = Buffer.from(header, 'utf8');
            const bodyBuf = Buffer.from(body, 'utf8');
            const buffers =
                parts !== undefined && parts.length > 0
                    ? [headerBuf, bodyBuf, BUF_NEWLINE, ...parts]
                    : [headerBuf, bodyBuf, BUF_NEWLINE];
            return Buffer.concat(buffers);
        } finally {
            convertFunc = undefined;
        }
    }

    private deserializeImpl(buffer: Buffer, options?: IDeserializeOptions): unknown {
        let text: string | undefined;
        let simple = false;

        // Check for 'JBxx\n' by checking that we have newline at position 4.
        // This is sufficient, all other headers have at least a seed which makes
        // them longer without newline character at position 4.
        if (buffer[4] === CHARCODE_NEWLINE) {
            if (buffer[2] > CHARCODE_0) {
                throw new Error(`Unsupported JB major version ${buffer[2].toString()}`);
            }
            if (buffer[0] !== CHARCODE_J || buffer[1] !== CHARCODE_B) {
                throw new Error('Invalid JB header');
            }
            text = buffer.toString('utf8', JB_HEADER_PREFIX.length);
            simple = !buffer.includes(NULL_BUF);
            if (simple) {
                return JSON.parse(text);
            }
        }

        const headerEnd = buffer.indexOf(CHARCODE_NEWLINE, JB_HEADER_PREFIX.length);
        if (headerEnd < 0) {
            throw new Error('Corrupt JB input: No end of header');
        }
        const header = buffer.toString('ascii', JB_HEADER_PREFIX.length, headerEnd);
        const headerParts = header.split(';');
        let partLens: string[] | undefined;
        if (headerParts[JB_HEADER_PARTIDX_PART_LENGTHS]) {
            partLens = headerParts[JB_HEADER_PARTIDX_PART_LENGTHS].split(',');
        }
        const jsonLen = headerParts[JB_HEADER_PARTIDX_JSON_LENGTH] ?? '';
        let cursor = headerEnd + 1;
        text = jsonLen === '' ? buffer.toString('utf8', cursor) : buffer.toString('utf8', cursor, cursor + parseInt(jsonLen));

        if (jsonLen !== '') {
            cursor += parseInt(jsonLen) + NEWLINE_LENGTH;
        }

        const replacers: (() => void)[] = [];
        let nextBufIdx = 0;

        const parsed = JSON.parse(text, function (key, value) {
            if (value === null) {
                // We do not want nulls in our data structures, we want undefined's. We cannot simply
                // return undefined here, because in that case, the entire key would be omitted (which
                // is not okay for arrays -- holes in arrays must be preserved).
                // As a workaround, we register a list of callbacks that will replace the corresponding
                // value in the parent object ('this') with undefined after parsing is done.
                replacers.push(() => {
                    this[key] = undefined;
                });
                return value;
            }

            const foundSeed = (value as IContainedBuffer)?.__b;
            if (foundSeed) {
                const expectedSeed = headerParts[JB_HEADER_PARTIDX_SEED];
                if (foundSeed === expectedSeed) {
                    const partLength = partLens?.[nextBufIdx] ?? '';
                    nextBufIdx++;
                    if (partLength === '') {
                        const b64 = (value as IContainedBuffer)?.b64;
                        if (b64 === undefined) {
                            return Buffer.from([]);
                        }
                        return Buffer.from(b64, 'base64');
                    }
                    const start = cursor;
                    const partLengthInt = parseInt(partLength);
                    cursor += partLengthInt + NEWLINE_LENGTH;
                    let buf = buffer.subarray(start, start + partLengthInt);
                    if (options?.copyBuffers) {
                        buf = Buffer.from(buf);
                    }
                    return buf;
                }
            }
            return value;
        });

        // Replace occurrances of 'null' with 'undefined'.
        if (replacers.length > 0) {
            for (const replacer of replacers) {
                replacer();
            }
        }
        return parsed;
    }
}

/**
 *  Have Buffer objects use our JSON serialization (when assigned to `convertFunc`). Otherwise, Buffer objects
 * fall back to the original implementation.
 */
function patchBufferToJSON() {
    const oldToJSON = Buffer.prototype.toJSON;

    Buffer.prototype.toJSON = function () {
        if (convertFunc) {
            return convertFunc(this);
        } else {
            return oldToJSON.call(this);
        }
    };
}

let seeds = '';
let seedIdx = 0;
const seedBytes = Buffer.allocUnsafe(1024);

// Invoking crypto is much more efficient on a larger amount of bytes. So cache those bytes,
// and return a subsection every time.
function nextSeed(len: number): string {
    if (seedIdx >= seeds.length - len) {
        crypto.randomFillSync(seedBytes);
        seeds = seedBytes.toString('base64');
        seedIdx = 0;
    }
    const result = seeds.slice(seedIdx, seedIdx + len);
    seedIdx += len;
    return result;
}

patchBufferToJSON();
