import { BufferOf, IDeSer } from './deser';
import { isObject } from './util';
import { IMultiPart, MultiPartGenerator, MultipartParser } from './multipart';
import * as uuid from 'uuid';


interface IBsonPrimitive {
    _DARLEAN_BSON_PRIMITIVE: boolean;
    value: unknown;
}

interface IBufferSer2 {
    type: 'Buffer',
    boundary: string,
    idx: number
}

let convertFunc: ((buffer: Buffer) => unknown) | undefined = undefined;

const NULL_BUF = Buffer.from('null');

/**
 * Serializer/deserializer that uses the MIME message body format (RFC 2045)
 * to represent the data.
 * 
 * Data is stored as JSON encoded blob with the corresponding Content-Type header.
 * When the data contains Buffer instances, a multipart message is created with
 * the JSON encoded blob as first part, and each of the blobs as remaining parts.
 */
export class MimeDeSer implements IDeSer {
    private generator: MultiPartGenerator;
    private parser: MultipartParser;

    constructor() {
        this.generator = new MultiPartGenerator();
        this.parser = new MultipartParser();
    }

    public serialize(value: unknown): Buffer {
        if (isObject(value) && !Buffer.isBuffer(value)) {
            return this.serializeImpl(value);
        } else {
            const v: IBsonPrimitive = {
                _DARLEAN_BSON_PRIMITIVE: true,
                value
            };
            return this.serializeImpl(v);
        }
    }

    public deserialize(buffer: Buffer): unknown {
        if (buffer === undefined) {
            return undefined;
        }

        const value = this.deserializeImpl(buffer);
        if ((value as IBsonPrimitive)._DARLEAN_BSON_PRIMITIVE) {
            const prim = (value as IBsonPrimitive).value;
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
        const boundary = uuid.v4();
        const parts: IMultiPart[] = [];
            
        convertFunc = function (buffer: Buffer) {
            parts.push({ body: buffer });
            return { type: 'Buffer', boundary, idx: parts.length };
        }
        try {
            const body = JSON.stringify(value);

            const basePart: IMultiPart = { 
                headers: { 'content-type': 'text/json' }, 
                body: Buffer.from(body, 'utf-8')
            }    
            return this.generator.generate([basePart, ...parts], boundary);
        } finally {
            convertFunc = undefined;
        }
    }

    private deserializeImpl(buffer: Buffer): unknown {
        const {parts, boundary} = this.parser.parse(buffer);
        if (parts.length > 0) {
            const replacers: (() => void)[] = [];
            const text = parts[0].body.toString('utf-8');

            const simple = ((parts.length === 1) && (!parts[0].body.includes(NULL_BUF)));

            const parsed = simple ? JSON.parse(text) : JSON.parse(text, function (key, value) {
                if (value === null) {
                    // We do not want null's in our data structures, we want undefined's. We cannot simply
                    // return undefined here, because in that case, the entire key would be omitted (which
                    // is not okay for arrays -- holes in arrays must be preserved).
                    // As a workaround, we register a list of callbacks that will replace the corresponding
                    // value in the parent object ('this') with undefined after parsing is done.
                    replacers.push( () => {
                        this[key] = undefined;
                    });
                    return value;
                }
                if ( ((value as IBufferSer2)?.type === 'Buffer')) {
                    if ((value as IBufferSer2).boundary !== boundary) {
                        return value;
                    }
                    const idx = (value as IBufferSer2).idx;
                    if (idx !== undefined) {
                        const buffer = parts[idx].body;
                        return buffer;
                    }
                }
                return value;
            });
            // Replace occurrances of 'null' with 'undefined'.
            for (const replacer of replacers) {
                replacer();
            }
            return parsed;
        }
    }
}

function patchBufferToJSON() {
    const oldToJSON = Buffer.prototype.toJSON;

    Buffer.prototype.toJSON = function () {
        if (convertFunc) {
            return convertFunc(this);
        } else {
            return oldToJSON.call(this);
        }
    }
}

patchBufferToJSON();