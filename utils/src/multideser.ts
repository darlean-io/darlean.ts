import { BufferOf, IDeSer, IDeserializeOptions } from './deser';
import { BsonDeSer } from './bsondeser';
import { MimeDeSer } from './mimedeser';
import { JBDeSer } from './jsonbinarydeser';
import { CanonicalJsonDeSer } from './canonicaldeser';

/**
 * Serializer/Deserialize that supports BSON and MIME decoding and encoding.
 * The default encoding is MIME.
 */
export class MultiDeSer implements IDeSer {
    private bsonDeSer: BsonDeSer;
    private mimeDeSer: MimeDeSer;
    private jbDeSer: JBDeSer;
    private cjDeSer: CanonicalJsonDeSer;
    private serialization: 'mime' | 'bson' | 'jb';

    constructor(serialization?: 'mime' | 'bson' | 'jb') {
        this.serialization = serialization ?? 'jb';
        this.bsonDeSer = new BsonDeSer(false);
        this.mimeDeSer = new MimeDeSer();
        this.jbDeSer = new JBDeSer();
        this.cjDeSer = new CanonicalJsonDeSer();
    }

    public serialize(value: unknown): Buffer {
        const result = this.trySerialize(value);
        if (!result) {
            throw new Error('Unable to serialize the provided value');
        }
        return result;
    }

    public trySerialize(value: unknown): Buffer | undefined {
        const result = this.cjDeSer.trySerialize(value);
        if (result) {
            return result;
        }

        if (this.serialization === 'jb') {
            return this.jbDeSer.trySerialize(value);
        }
        if (this.serialization === 'bson') {
            return this.bsonDeSer.trySerialize(value);
        }
        return this.mimeDeSer.trySerialize(value);
    }

    public deserialize(buffer: Buffer, options?: IDeserializeOptions): unknown {
        if (buffer === undefined) {
            return undefined;
        }
        if (this.cjDeSer.detect(buffer)) {
            return this.cjDeSer.deserialize(buffer);
        }
        if (this.jbDeSer.detect(buffer)) {
            return this.jbDeSer.deserialize(buffer, options);
        }
        if (this.bsonDeSer.detect(buffer)) {
            return this.bsonDeSer.deserialize(buffer);
        }
        return this.mimeDeSer.deserialize(buffer);
    }

    public deserializeTyped<T>(buffer: BufferOf<T>): T {
        return this.deserialize(buffer) as T;
    }
}
