import { BufferOf, IDeSer } from './deser';
import { CanonicalJsonDeserializer, CanonicalJsonSerializer } from '@darlean/canonical-json';
import { ICanonicalSource } from '@darlean/canonical';

const CJ_VERSION_MAJOR = '0';
const CJ_VERSION_MINOR = '0';

const CJ_HEADER_PREFIX = 'CJ' + CJ_VERSION_MAJOR + CJ_VERSION_MINOR;
const CJ_HEADER_PREFIX_BUF = Buffer.from(CJ_HEADER_PREFIX);

const CHARCODE_CJ_VERSION_MAJOR = CJ_VERSION_MAJOR.charCodeAt(0);
const CHARCODE_C = 'C'.charCodeAt(0);
const CHARCODE_J = 'J'.charCodeAt(0);

export class CanonicalJsonDeSer implements IDeSer {
    private serializer: CanonicalJsonSerializer;
    private deserializer: CanonicalJsonDeserializer;

    constructor() {
        this.serializer = new CanonicalJsonSerializer();
        this.deserializer = new CanonicalJsonDeserializer();
    }

    public detect(buffer: Buffer): boolean {
        return buffer.byteLength >= 5 && buffer[0] === CHARCODE_C && buffer[1] === CHARCODE_J;
    }

    public serialize(value: unknown): Buffer {
        const result = this.trySerialize(value);
        if (result === undefined) {
            throw new Error('Unable to serialize: input value is not a canonical source');
        }
        return result;
    }

    public trySerialize(value: unknown): Buffer | undefined {
        if (value === undefined || !(value as ICanonicalSource)?._peekCanonicalRepresentation) {
            return undefined;
        }
        const asCanonicalSource = value as ICanonicalSource;
        const canonical = asCanonicalSource._peekCanonicalRepresentation();
        const buf = this.serializer.serialize(canonical);
        return Buffer.concat([CJ_HEADER_PREFIX_BUF, buf]);
    }

    public deserialize(buffer: Buffer): unknown {
        if (buffer === undefined) {
            return undefined;
        }
        if (buffer[0] !== CHARCODE_C || buffer[1] !== CHARCODE_J) {
            throw new Error('Invalid CJ header');
        }
        if (buffer[2] > CHARCODE_CJ_VERSION_MAJOR) {
            throw new Error(`Unsupported CJ major version ${buffer[2].toString()}`);
        }
        const contents = buffer.subarray(4);
        return this.deserializer.deserialize(contents);
    }

    public deserializeTyped<T>(buffer: BufferOf<T>): T {
        return this.deserialize(buffer) as T;
    }
}
