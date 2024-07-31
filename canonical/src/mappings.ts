import { BaseCanonical } from './base-canonical';
import { CanonicalLike, CanonicalLogicalTypes, ICanonicalSource, IMappingEntry } from './canonical';
import { toCanonicalOrUndefined } from './helpers';

/**
 * MapCanonical represents a canonical value backed by a map. The map must not be modified anymore.
 */
export class MapCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical {
    private constructor(private value: Map<string, CanonicalLike<T>>, logicalTypes: CanonicalLogicalTypes = []) {
        super('mapping', logicalTypes);
    }

    public get firstMappingEntry(): IMappingEntry<T> | undefined {
        const entries = this.value.entries();
        return this.getMapItem(entries);
    }

    public get size(): number {
        return this.value.size;
    }

    public equals(other?: CanonicalLike<T>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!super.equals(other)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const otherSize = other!.size;
        if (otherSize !== undefined && otherSize !== this.value.size) {
            return false;
        }
        let entry = other?.firstMappingEntry;
        let n = 0;
        while (entry) {
            const value = toCanonicalOrUndefined(this.value.get(entry.key));
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const otherValue = toCanonicalOrUndefined(entry.value);

            if (value === undefined) {
                if (otherValue !== undefined) {
                    return false;
                }
            } else {
                if (!value.equals(otherValue)) {
                    return false;
                }
            }
            n++;
            entry = entry.next();
        }

        if (n !== this.value.size) {
            return false;
        }

        return true;
    }

    public static from<T extends ICanonicalSource = ICanonicalSource>(
        value: Map<string, CanonicalLike<T>>,
        logicalTypes: CanonicalLogicalTypes = []
    ) {
        return new MapCanonical(value, logicalTypes);
    }

    private getMapItem<T extends ICanonicalSource = ICanonicalSource>(
        iterator: IterableIterator<[string, CanonicalLike<T>]>
    ): IMappingEntry<T> | undefined {
        const result = iterator.next();
        if (result.done) {
            return undefined;
        }
        return {
            key: result.value[0],
            value: result.value[1],
            next: () => {
                if (result.done) {
                    return undefined;
                }
                return this.getMapItem(iterator);
            }
        };
    }
}

/**
 * DictCanonical represents a canonical value backed by a dictionary. The dictionary must not be modified anymore.
 */

export class DictCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: { [key: string]: CanonicalLike<T> }, logicalTypes: CanonicalLogicalTypes = []) {
        super('mapping', logicalTypes);
    }

    public get firstMappingEntry(): IMappingEntry<T> | undefined {
        const entries = Object.entries(this.value).values();
        return this.getNextMapItemFromIterator(entries);
    }

    public get size(): number {
        return Object.keys(this.value).length;
    }

    public static from<T extends ICanonicalSource = ICanonicalSource>(
        value: { [key: string]: CanonicalLike<T> },
        logicalTypes: CanonicalLogicalTypes = []
    ) {
        return new DictCanonical(value, logicalTypes);
    }

    private getNextMapItemFromIterator(iterator: IterableIterator<[string, CanonicalLike<T>]>): IMappingEntry<T> | undefined {
        const result = iterator.next();
        if (result.done) {
            return undefined;
        }
        return {
            key: result.value[0],
            value: result.value[1],
            next: () => {
                if (result.done) {
                    return undefined;
                }
                return this.getNextMapItemFromIterator(iterator);
            }
        };
    }

    public equals(other?: CanonicalLike<T>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!super.equals(other)) {
            return false;
        }
        let entry = other?.firstMappingEntry;
        let n = 0;
        while (entry) {
            const value = toCanonicalOrUndefined(this.value[entry.key]);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const otherValue = toCanonicalOrUndefined(entry.value);

            if (value === undefined) {
                if (otherValue !== undefined) {
                    return false;
                }
            } else {
                if (!value.equals(otherValue)) {
                    return false;
                }
            }
            n++;
            entry = entry.next();
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        if (n !== Object.keys(this.value).length) {
            return false;
        }

        return true;
    }
}
