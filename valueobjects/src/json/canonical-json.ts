import { ICanonical } from "../canonical/base";
import { DictCanonical } from "../canonical/mappings";
import { BinaryCanonical, BoolCanonical, FloatCanonical, IntCanonical, MomentCanonical, NoneCanonical, StringCanonical } from "../canonical/primitives";
import { ArrayCanonical } from "../canonical/sequences";
import { IValueDef } from "../valueobjects/valueobject";

export class CanonicalJsonSerializer {
    public serialize(canonical: ICanonical) {
        // Naive implementation that first constructs an in-memory tree,
        // and then dumps that tree into json.
        const root = this.treeifyNode(canonical);
        return JSON.stringify(root);
    }

    private treeifyNode(canonical: ICanonical): unknown {
        switch (canonical.type) {
            case 'none': return undefined;
            case 'string': return canonical.stringValue + ':s';
            case 'int': return canonical.intValue.toString() + ':i';
            case 'float': return canonical.floatValue.toString() + ':f';
            case 'bool': return canonical.boolValue.toString() + ':b';
            case 'moment': return canonical.momentValue.valueOf() + ':m';
            case 'binary': return Buffer.from(canonical.binaryValue).toString('base64') + ':6';
            case 'mapping': {
                const obj: {[key: string]: unknown} = {};
                let entry = canonical.firstMappingItem;
                while (entry) {
                    obj[entry.key] = this.treeifyNode(entry.value);
                    entry = entry.next();
                }
                return obj;
            }
            case 'sequence': {
                const arr: unknown[] = [];
                let item = canonical.firstSequenceItem;
                while (item) {
                    arr.push(this.treeifyNode(item.value));
                    item = item.next();
                }
                return arr;
            }
        }
        throw new Error(`Invalid type: ${canonical.type}`)
    }
}

export class CanonicalJsonDeserializer {
    public deserialize(json: string, root: IValueDef<unknown>): unknown {
        const parsed = JSON.parse(json);
        const rootCanonical = this.processNode(parsed);
        return root.construct(rootCanonical);
    } 

    private processNode(node: unknown): ICanonical {
        switch (typeof node) {
            case 'string': {
                const type = node.at(-1) ?? '';
                const core = node.substring(0, node.length-2);
                switch (type) {
                    case 'b': return new BoolCanonical(core === 'true');
                    case 'i': return new IntCanonical(parseInt(core, 10));
                    case 'f': return new FloatCanonical(parseFloat(core));
                    case 's': return new StringCanonical(core);
                    case '6': return new BinaryCanonical( Buffer.from(core, 'base64'));
                    case 'm': return new MomentCanonical(new Date(parseFloat(core)));
                    default: throw new Error('Undefined string type: ' + type);
                }
            }
            case 'undefined': {
                return new NoneCanonical();
            }
            case 'object': {
                if (Array.isArray(node)) {
                    const values: ICanonical[] = node.map((x) => this.processNode(x));
                    return new ArrayCanonical(values);
                } else {
                    const map: {[key: string]: ICanonical} = {};
                    for (const [key, value] of Object.entries(node as object)) {
                        map[key] = this.processNode(value);
                    }
                    return new DictCanonical(map);
                }
            }
            default: throw new Error('Unsupported json value');
        }
    }
}