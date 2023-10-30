import { BufferOf, IDeSer, IDeserializeOptions } from './deser';
import { BsonDeSer } from './bsondeser';
import { MimeDeSer } from './mimedeser';
import { JBDeSer } from './jsonbinarydeser';

/**
 * Serializer/Deserialize that supports BSON and MIME decoding and encoding.
 * The default encoding is MIME.
 */
export class MultiDeSer implements IDeSer {
    private bsonDeSer: BsonDeSer;
    private mimeDeSer: MimeDeSer;
    private jbDeSer: JBDeSer;
    private serialization: 'mime' | 'bson' | 'jb';

    constructor(serialization?: 'mime' | 'bson' | 'jb') {
        this.serialization = serialization ?? 'jb';
        this.bsonDeSer = new BsonDeSer(false);
        this.mimeDeSer = new MimeDeSer();
        this.jbDeSer = new JBDeSer();
    }

    public serialize(value: unknown): Buffer {
        if (this.serialization === 'jb') {
            return this.jbDeSer.serialize(value);
        }
        if (this.serialization === 'bson') {
            return this.bsonDeSer.serialize(value);
        }
        return this.mimeDeSer.serialize(value);
    }

    public deserialize(buffer: Buffer, options?: IDeserializeOptions): unknown {
        if (buffer === undefined) {
            return undefined;
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
