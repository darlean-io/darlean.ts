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
            (value as IBsonStruct)._DARLEAN_BSON_BUFFER = () => buffer;
            (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;
            return buffer;
        } else {
            const v: IBsonPrimitive = {
                _DARLEAN_BSON_PRIMITIVE: true,
                value
            };
            const buffer = bson.serialize(v as bson.Document);
            (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;
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
            (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => prim;
            return prim;
        }
        (buffer as unknown as IBsonBuffer)._DARLEAN_BSON_VALUE = () => value;
        (value as IBsonStruct)._DARLEAN_BSON_BUFFER = () => buffer;
        return value;
    }
}
