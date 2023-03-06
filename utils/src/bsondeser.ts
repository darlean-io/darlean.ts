import { IDeSer } from './deser';
import * as bson from 'bson';
import { isObject } from './util';

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
            const [prim2] = cleanup(10, prim);
            return prim2;
        }
        if (this.caching) {
            Object.defineProperty(buffer, '_DARLEAN_BSON_VALUE', { value: () => value, enumerable: false, writable: true });
            Object.defineProperty(value, '_DARLEAN_BSON_BUFFER', { value: () => buffer, enumerable: false, writable: true });
        }
        cleanup(10, value);
        return value;
    }
}

// Recursively replaces null values with undefined. That is required because BSON formally does not support undefined as value.
// To remain compatible with other languages, we respect that our BSON library converts undefined to null (only in arrays; in
// objects, undefined values are simply removed which is ok as it will result in undefined after deserializing the object). but
// must manually walk our structure to replace null with undefined.
function cleanup(level: number, value: unknown): [unknown, boolean] {
    if (level < 0) {
        return [value, false];
    }
    if (value === null) {
        return [undefined, true];
    }
    if (Array.isArray(value)) {
        for (let idx = 0; idx < value.length; idx++) {
            const [v, ch] = cleanup(level - 1, value[idx]);
            if (ch) {
                value[idx] = v;
            }
        }
        return [value, false];
    } else if (value && isObject(value) && !Buffer.isBuffer(value)) {
        for (const [key, v] of Object.entries(value)) {
            const [v2, ch] = cleanup(level - 1, v);
            if (ch) {
                (value as { [key: string]: unknown })[key] = v2;
            }
        }
        return [value, false];
    } else {
        return [value, false];
    }
}
