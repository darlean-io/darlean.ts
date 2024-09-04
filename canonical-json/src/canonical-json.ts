import {
    ArrayCanonical,
    BinaryCanonical,
    BoolCanonical,
    CanonicalLike,
    DictCanonical,
    FloatCanonical,
    ICanonical,
    ICanonicalSource,
    IntCanonical,
    MomentCanonical,
    NoneCanonical,
    StringCanonical,
    toCanonical
} from '@darlean/canonical';

/**
 * Character used to start a mapping key when it contains canonical meta data (like the logical types).
 * When regular mapping keys start with ESCAPE, they are prefixed with an extra ESCAPE to descriminate
 * regular keys from meta data keys.
 * The escape character is chosen such that it is easily represented in common serialization format key names,
 * including JSON (which is easy -- it can any regular character as keys are within quotes) and XML (which accepts
 * underscores as element names).
 */
const ESCAPE = '_';
const ESCAPE_ESCAPE = ESCAPE + ESCAPE;

export class CanonicalJsonSerializer {
    public serializeToString<T extends ICanonicalSource = ICanonicalSource>(
        canonical: CanonicalLike<T>,
        indent?: string | number
    ): string {
        // Naive implementation that first constructs an in-memory tree,
        // and then dumps that tree into json.
        const root = this.treeifyNode(toCanonical(canonical));
        return JSON.stringify(root, undefined, indent);
    }

    public serialize<T extends ICanonicalSource = ICanonicalSource>(canonical: CanonicalLike<T>): Buffer {
        // Naive implementation that first constructs an in-memory tree,
        // and then dumps that tree into json.
        const root = this.treeifyNode(toCanonical(canonical));
        return Buffer.from(JSON.stringify(root), 'utf-8');
    }

    public toNative<T extends ICanonicalSource = ICanonicalSource>(canonical: CanonicalLike<T>): unknown {
        return this.treeifyNode(toCanonical(canonical));
    }

    private treeifyNode(canonical: ICanonical): unknown {
        const logicals = canonical.logicalTypes.join('.') || '-';
        switch (canonical.physicalType) {
            case 'none':
                return '(' + logicals + ' -)';
            case 'string':
                return canonical.stringValue + ' (' + logicals + ' s)';
            case 'int':
                return canonical.intValue.toString() + ' (' + logicals + ' i)';
            case 'float':
                return canonical.floatValue.toString() + ' (' + logicals + ' f)';
            case 'bool':
                return canonical.boolValue.toString() + ' (' + logicals + ' b)';
            case 'moment':
                return canonical.momentValue.valueOf() + ' (' + logicals + ' m)';
            case 'binary':
                return Buffer.from(canonical.binaryValue).toString('base64') + ' (' + logicals + ' 6)';
            case 'mapping': {
                const obj: { [key: string]: unknown } = {};
                let entry = canonical.firstMappingEntry;
                while (entry) {
                    const key = (entry.key.startsWith(ESCAPE)) ? ESCAPE + entry.key : entry.key;
                    obj[key] = this.treeifyNode(toCanonical(entry.value));
                    entry = entry.next();
                }
                obj[ESCAPE] = logicals;
                return obj;
            }
            case 'sequence': {
                const arr: unknown[] = [];
                let item = canonical.firstSequenceItem;
                while (item) {
                    arr.push(this.treeifyNode(toCanonical(item.value)));
                    item = item.next();
                }
                arr.push(logicals);
                return arr;
            }
        }
        throw new Error(`Invalid type: ${canonical.physicalType}`);
    }
}

export class CanonicalJsonDeserializer {
    public deserialize<T extends ICanonicalSource = ICanonicalSource>(json: Buffer): ICanonical<T> {
        const parsed = JSON.parse(json.toString('utf-8'));
        return this.processNode(parsed);
    }

    public deserializeFromString<T extends ICanonicalSource = ICanonicalSource>(json: string): ICanonical<T> {
        const parsed = JSON.parse(json);
        return this.processNode(parsed);
    }

    public fromNative<T extends ICanonicalSource = ICanonicalSource>(value: unknown): ICanonical<T> {
        return this.processNode(value);
    }

    private processNode(node: unknown): ICanonical {
        switch (typeof node) {
            case 'string': {
                const a = node.lastIndexOf('(');
                const b = node.lastIndexOf(' ');
                const logicalsRaw = node.substring(a + 1, b);
                const logicals = splitLogicalsRaw(logicalsRaw);
                const type = node.substring(b + 1, node.length - 1); // Ignore trailing )
                const core = node.substring(0, a - 1); // Take space before ( into account)
                switch (type) {
                    case 'b':
                        return BoolCanonical.from(core === 'true', logicals);
                    case 'i':
                        return IntCanonical.from(parseInt(core, 10), logicals);
                    case 'f':
                        return FloatCanonical.from(parseFloat(core), logicals);
                    case 's':
                        return StringCanonical.from(core, logicals);
                    case '6':
                        return BinaryCanonical.from(Buffer.from(core, 'base64'), logicals);
                    case 'm':
                        return MomentCanonical.from(new Date(parseFloat(core)), logicals);
                    case '-':
                        return NoneCanonical.from(logicals);
                    default:
                        throw new Error('Undefined string type: ' + type);
                }
            }
            case 'object': {
                if (Array.isArray(node)) {
                    const logicalsRaw = node.splice(node.length - 1, 1)[0];
                    const logicals = splitLogicalsRaw(logicalsRaw);
                    const values: ICanonical[] = node.map((x) => this.processNode(x));
                    return ArrayCanonical.from(values, logicals);
                } else {
                    const dict: { [key: string]: ICanonical } = {};
                    let logicalsRaw = '';
                    for (const [key, value] of Object.entries(node as object)) {
                        if ((key.startsWith(ESCAPE)) && (!key.startsWith(ESCAPE_ESCAPE))) {
                            if (key === ESCAPE) {
                                logicalsRaw = value;
                            }
                        } else if (key.startsWith(ESCAPE)) {
                            dict[key.substring(1)] = this.processNode(value);
                        } else {
                            dict[key] = this.processNode(value);
                        }
                    }
                    return DictCanonical.from(dict, splitLogicalsRaw(logicalsRaw));
                }
            }
            default:
                throw new Error('Unsupported json value');
        }
    }
}

function splitLogicalsRaw(raw: string): string[] {
    return raw === '-' ? [] : raw.split('.');
}
