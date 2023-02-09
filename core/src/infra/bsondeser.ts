import { IDeSer } from './deser';
import * as bson from 'bson';
import { isObject } from '@darlean/utils';

interface IBsonStruct {
    _DARLEAN_BSON_BUFFER: () => Buffer;
}

interface IBsonPrimitive {
    _DARLEAN_BSON_PRIMITIVE: boolean;
    value: unknown;
}

interface IBsonBuffer {
    _DARLEAN_BSON_VALUE: () => unknown;
}

const OPTIONS: bson.DeserializeOptions = {
    promoteBuffers: true
};

export class BsonDeSer implements IDeSer {
    private caching = false;

    constructor(caching = false) {
        this.caching = caching;
    }

    public serialize(value: unknown): Buffer {
        if (this.caching) {
            if ((value as IBsonStruct)._DARLEAN_BSON_BUFFER) {
                return (value as IBsonStruct)._DARLEAN_BSON_BUFFER();
            }
        }
        if (isObject(value) && !Buffer.isBuffer(value)) {
            const buffer = bson.serialize(value as bson.Document);
            if (this.caching) {
                Object.defineProperty(value, '_DARLEAN_BSON_BUFFER', { value: () => buffer, enumerable: false, writable: true });
                Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            }
            return buffer;
        } else {
            const v: IBsonPrimitive = {
                _DARLEAN_BSON_PRIMITIVE: true,
                value
            };
            const buffer = bson.serialize(v as bson.Document);
            if (this.caching) {
                Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            }
            return buffer;
        }
    }

    public deserialize(buffer: Buffer): unknown {
        if (buffer === undefined) {
            return undefined;
        }

        if (this.caching) {
            if ((buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE !== undefined) {
                return (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE();
            }
        }
        const value = bson.deserialize(buffer, OPTIONS);
        if ((value as IBsonPrimitive)._DARLEAN_BSON_PRIMITIVE) {
            const prim = (value as IBsonPrimitive).value;
            if (this.caching) {
                Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => prim, enumerable: false, writable: true });
            }
            return prim;
        }
        if (this.caching) {
            Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            Object.defineProperty(value, '_DARLEAN_BSON_BUFFER', { value: () => buffer, enumerable: false, writable: true });
        }
        return value;
    }
}
