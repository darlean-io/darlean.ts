import {
    CanonicalLike,
    CanonicalPhysicalType,
    ICanonical,
    ICanonicalSource,
    IMappingEntry,
    ISequenceItem
} from '../../canonical/src/canonical';

/**
 * FlexCanonical is an implementation of a canonical that does not have type information
 * inside. Depending on which method is invoked, it tries to convert the internal value to
 * the request type of value.
 *
 * FlexCanonical is useful to map parsed JSON/XML (that normally does not contain logical and/or physical
 * type annotations) on value objects.
 */
export class FlexCanonical<TSource extends ICanonicalSource> implements ICanonical<TSource> {
    constructor(private value: unknown) {}

    get physicalType(): CanonicalPhysicalType {
        throw new Error('Method not implemented for a flex canonical.');
    }
    get logicalTypes(): string[] {
        return [];
    }
    get noneValue(): undefined {
        if (this.value === undefined || this.value === '') {
            return undefined;
        }
        throw this.fail('a none value');
    }
    get boolValue(): boolean {
        if (this.value === false || this.value === 'false') {
            return false;
        }
        if (this.value === true || this.value === 'true') {
            return true;
        }
        throw this.fail('a bool value');
    }
    get intValue(): number {
        if (typeof this.value === 'number') {
            return this.value;
        }
        if (typeof this.value === 'string') {
            const nr = Number(this.value);
            if (!Number.isNaN(nr)) {
                return nr;
            }
        }
        throw this.fail('an int value');
    }
    get floatValue(): number {
        if (typeof this.value === 'number') {
            return this.value;
        }
        const nr = Number(this.value);
        if (!Number.isNaN(nr)) {
            return nr;
        }
        throw this.fail('a float value');
    }
    get stringValue(): string {
        if (typeof this.value === 'string') {
            return this.value;
        }
        throw this.fail('a string value');
    }
    get momentValue(): Date {
        if (typeof this.value === 'number') {
            return new Date(this.value);
        }
        if (typeof this.value === 'string') {
            const asNumber = Number(this.value);
            if (!Number.isNaN(asNumber)) {
                // We have a number, indicating ms since epoch
                return new Date(asNumber);
            }
            // TODO: CHeck that format is ISO format.
            // Other formats should not be supported to reduce incompatibilities
            // with other languaes.
            return new Date(this.value);
        }
        if (this.value instanceof Date) {
            return this.value;
        }
        throw this.fail('a moment value');
    }
    get binaryValue(): Buffer {
        if (typeof this.value === 'string') {
            return Buffer.from(this.value, 'base64');
        }
        if (Buffer.isBuffer(this.value)) {
            return this.value;
        }
        throw this.fail('a buffer value');
    }
    get firstSequenceItem(): ISequenceItem<TSource> | undefined {
        if (Array.isArray(this.value)) {
            const array = this.value;
            let idx = -1;
            const next = () => {
                idx++;
                if (idx >= array.length) {
                    return undefined;
                }
                return {
                    value: new FlexCanonical(array[idx]),
                    next
                } as ISequenceItem<TSource>;
            };
            return next();
        }
        throw this.fail('a sequence value');
    }
    get firstMappingEntry(): IMappingEntry<TSource> | undefined {
        if (typeof this.value === 'object') {
            const entries = Object.entries(this.value as { [key: string]: unknown });
            let idx = -1;
            const next = () => {
                idx++;
                if (idx >= entries.length) {
                    return undefined;
                }
                return {
                    key: entries[idx][0],
                    value: new FlexCanonical(entries[idx][1]),
                    next
                } as IMappingEntry<TSource>;
            };
            return next();
        }
        throw this.fail('a mapping value');
    }
    get size(): number | undefined {
        throw new Error('Method not implemented.');
    }
    isCanonical(): this is ICanonical<TSource> {
        return true;
    }
    equals(_other?: CanonicalLike<TSource> | undefined): boolean {
        throw new Error('Method not implemented.');
    }
    is(_base: CanonicalLike<TSource>): boolean {
        // A flex canonical is always any other base. We don't have any type information
        // to decide otherwise. When we would return false, we would not be considered compatible
        // to any other value, which renders the flex canonical useless.
        return true;
    }
    private fail(kind: string) {
        throw new Error(`The flex canonical is not ${kind}`);
    }
}
