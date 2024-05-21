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
        return JSON.stringify(root, undefined, 2);
    }

    private treeifyNode(canonical: ICanonical): unknown {
        const logicals = canonical.logicalTypes.join('.') || '-';
        switch (canonical.physicalType) {
            case 'none': return '(' + logicals + ' -)';
            case 'string': return canonical.stringValue + ' (' + logicals + ' s)';
            case 'int': return canonical.intValue.toString() + ' (' + logicals + ' i)';
            case 'float': return canonical.floatValue.toString() + ' (' + logicals + ' f)';
            case 'bool': return canonical.boolValue.toString() + ' (' + logicals + ' b)';
            case 'moment': return canonical.momentValue.valueOf() + ' (' + logicals + ' m)';
            case 'binary': return Buffer.from(canonical.binaryValue).toString('base64') + ' (' + logicals + ' 6)';
            case 'mapping': {
                const obj: {[key: string]: unknown} = {};
                obj['type'] = logicals; 
                let entry = canonical.firstMappingItem;
                while (entry) {
                    obj[':' + entry.key] = this.treeifyNode(entry.value);
                    entry = entry.next();
                }
                return obj;
            }
            case 'sequence': {
                const arr: unknown[] = [];
                arr.push(logicals);
                let item = canonical.firstSequenceItem;
                while (item) {
                    arr.push(this.treeifyNode(item.value));
                    item = item.next();
                }
                return arr;
            }
        }
        throw new Error(`Invalid type: ${canonical.physicalType}`)
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
                const a = node.lastIndexOf('(');
                const b = node.lastIndexOf(' ');
                const logicalsRaw = node.substring(a+1, b);
                const logicals = logicalsRaw === '-' ? [] : logicalsRaw.split('.');
                const type = node.substring(b+1, node.length-1); // Ignore trailing )
                const core = node.substring(0, a-1); // Take space before ( into account)
                switch (type) {
                    case 'b': return new BoolCanonical(core === 'true', logicals);
                    case 'i': return new IntCanonical(parseInt(core, 10), logicals);
                    case 'f': return new FloatCanonical(parseFloat(core), logicals);
                    case 's': return new StringCanonical(core, logicals);
                    case '6': return new BinaryCanonical( Buffer.from(core, 'base64'), logicals);
                    case 'm': return new MomentCanonical(new Date(parseFloat(core)), logicals);
                    case '-': return new NoneCanonical(logicals);
                    default: throw new Error('Undefined string type: ' + type);
                }
            }
            case 'object': {
                if (Array.isArray(node)) {
                    const logicalsRaw = node.splice(0, 1)[0];
                    const logicals = logicalsRaw.includes('.') ? logicalsRaw.split('.') : [];
                    const values: ICanonical[] = node.map((x) => this.processNode(x));
                    return new ArrayCanonical(values, logicals);
                } else {
                    const map: {[key: string]: ICanonical} = {};
                    let logicalsRaw = '';
                    for (const [key, value] of Object.entries(node as object)) {
                        if (key === 'type') {
                            logicalsRaw = key;
                        } else
                        if (key.startsWith(':')) {
                            map[key.substring(1)] = this.processNode(value);
                        } else {
                            throw new Error('Invalid mapping key: ' + key);
                        }
                    }
                    return new DictCanonical(map);
                }
            }
            default: throw new Error('Unsupported json value');
        }
    }
}