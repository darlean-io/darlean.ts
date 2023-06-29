import { BufferOf, IDeSer } from './deser';
import { BsonDeSer } from './bsondeser';
import { MimeDeSer } from './mimedeser';

/**
 * Serializer/Deserialize that supports BSON and MIME decoding and encoding.
 * The default encoding is MIME.
 */
export class MultiDeSer implements IDeSer {
    private bsonDeSer: BsonDeSer;
    private mimeDeSer: MimeDeSer;
    private serialization: 'mime' | 'bson';

    constructor(serialization?: 'mime' | 'bson') {
        this.serialization = serialization ?? 'mime';
        this.bsonDeSer = new BsonDeSer(false);
        this.mimeDeSer = new MimeDeSer();
    }

    public serialize(value: unknown): Buffer {
        if (this.serialization === 'bson') {
            return this.bsonDeSer.serialize(value);
        }
        return this.mimeDeSer.serialize(value);
    }

    public deserialize(buffer: Buffer): unknown {
        if (buffer === undefined) {
            return undefined;
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
