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
    serialize(value: unknown): Buffer {
        if ((value as IBsonStruct)._DARLEAN_BSON_BUFFER) {
            return (value as IBsonStruct)._DARLEAN_BSON_BUFFER();
        }
        if (isObject(value) && !Buffer.isBuffer(value)) {
            const buffer = bson.serialize(value as bson.Document);
            Object.defineProperty(value, '_DARLEAN_BSON_BUFFER', { value: () => buffer, enumerable: false, writable: true });
            // (value as IBsonStruct)._DARLEAN_BSON_BUFFER = () => buffer;
            Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            //(buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;
            return buffer;
        } else {
            const v: IBsonPrimitive = {
                _DARLEAN_BSON_PRIMITIVE: true,
                value
            };
            const buffer = bson.serialize(v as bson.Document);
            Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            //(buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;  HERE
            return buffer;
        }
    }
    deserialize(buffer: Buffer): unknown {
        if (buffer === undefined) {
            return undefined;
        }

        if ((buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE !== undefined) {
            return (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE();
        }
        const value = bson.deserialize(buffer, OPTIONS);
        if ((value as IBsonPrimitive)._DARLEAN_BSON_PRIMITIVE) {
            const prim = (value as IBsonPrimitive).value;
            Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => prim, enumerable: false, writable: true });
            //(buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => prim; HERE
            return prim;
        }
        Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
        //(buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;
        Object.defineProperty(value, '_DARLEAN_BSON_BUFFER', { value: () => buffer, enumerable: false, writable: true });
        //(value as IBsonStruct)._DARLEAN_BSON_BUFFER = () => buffer;
        return value;
    }
}
