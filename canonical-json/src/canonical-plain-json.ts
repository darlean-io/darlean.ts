import { CanonicalLike, ICanonical, ICanonicalSource, toCanonical } from '@darlean/canonical';
import { FlexCanonical } from './flex-canonical';

/**
 * CanonicalPlainJsonSerializer serializes a canonical to a plain JSON structure
 * without type information (hence the name "plain").
 */
export class CanonicalPlainJsonSerializer {
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
        switch (canonical.physicalType) {
            case 'none':
                return undefined;
            case 'string':
                return canonical.stringValue;
            case 'int':
                return canonical.intValue.toString();
            case 'float':
                return canonical.floatValue.toString();
            case 'bool':
                return canonical.boolValue.toString();
            case 'moment':
                return canonical.momentValue.valueOf();
            case 'binary':
                return Buffer.from(canonical.binaryValue).toString('base64');
            case 'mapping': {
                const obj: { [key: string]: unknown } = {};
                let entry = canonical.firstMappingEntry;
                while (entry) {
                    obj[entry.key] = this.treeifyNode(toCanonical(entry.value));
                    entry = entry.next();
                }
                return obj;
            }
            case 'sequence': {
                const arr: unknown[] = [];
                let item = canonical.firstSequenceItem;
                while (item) {
                    arr.push(this.treeifyNode(toCanonical(item.value)));
                    item = item.next();
                }
                return arr;
            }
        }
        throw new Error(`Invalid type: ${canonical.physicalType}`);
    }
}

export class CanonicalPlainJsonDeserializer {
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
        return new FlexCanonical(node);
    }
}
