import { BaseCanonical } from './base-canonical';
import { CanonicalLogicalTypes, ICanonical, ICanonicalSource, IMappingEntry } from './canonical';
import { toCanonical, toCanonicalOrUndefined } from './helpers';

/**
 * MapCanonical represents a canonical value backed by a map. The map must not be modified anymore.
 */
export class MapCanonical<T = unknown> extends BaseCanonical {
    private constructor(private value: Map<string, ICanonical | ICanonicalSource<T>>, logicalTypes: CanonicalLogicalTypes = []) {
        super('mapping', logicalTypes);
    }

    public get firstMappingEntry(): IMappingEntry | undefined {
        const entries = this.value.entries();
        return this.getMapItem(entries);
    }

    public asMap(): Map<string, ICanonical> {
        const result = new Map<string, ICanonical>();
        for (const entry of this.value.entries()) {
            result.set(entry[0], toCanonical(entry[1]));
        }
        return result;
    }

    public asDict(): { [key: string]: ICanonical } {
        const result: { [key: string]: ICanonical } = {};
        for (const entry of this.value.entries()) {
            result[entry[0]] = toCanonical(entry[1]);
        }
        return result;
    }

    public equals(other?: ICanonical | ICanonicalSource<unknown>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!super.equals(other)) { return false; }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const otherMap = other!.asMap();
        if (otherMap.size !== this.value.size) { return false; }
        for (const key of this.value.keys()) {
            const value = toCanonicalOrUndefined(this.value.get(key));
            const otherValue = toCanonicalOrUndefined(otherMap.get(key));
            if (value === undefined) {
                if (otherValue !== undefined) {
                    return false;
                }
            } else {
                if (!value.equals(otherValue)) {
                    return false;
                }
            }
        }
        return true;
    }

    public static from<T = unknown>(
        value: Map<string, ICanonical | ICanonicalSource<T>>,
        logicalTypes: CanonicalLogicalTypes = []
    ) {
        return new MapCanonical(value, logicalTypes);
    }

    private getMapItem<T = unknown>(
        iterator: IterableIterator<[string, ICanonical | ICanonicalSource<T>]>
    ): IMappingEntry | undefined {
        const result = iterator.next();
        if (result.done) {
            return undefined;
        }
        return {
            key: result.value[0],
            value: toCanonical(result.value[1]),
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
 * MapCanonical represents a canonical value backed by a dictionary. The dictionary must not be modified anymore.
 */

export class DictCanonical<T = unknown> extends BaseCanonical {
    private constructor(private value: { [key: string]: ICanonical | ICanonicalSource<T> }, logicalTypes: CanonicalLogicalTypes = []) {
        super('mapping', logicalTypes);
    }

    public get firstMappingEntry(): IMappingEntry | undefined {
        const entries = Object.entries(this.value).values();
        return this.getMapItem(entries);
    }

    public asMap(): Map<string, ICanonical> {
        const result = new Map<string, ICanonical>();
        for (const entry of Object.entries(this.value)) {
            result.set(entry[0], toCanonical(entry[1]));
        }
        return result;
    }

    public asDict(): { [key: string]: ICanonical } {
        const result: { [key: string]: ICanonical } = {};
        for (const entry of Object.entries(this.value)) {
            result[entry[0]] = toCanonical(entry[1]);
        }
        return result;
    }

    public static from<T = unknown>(value: { [key: string]: ICanonical | ICanonicalSource<T> }, logicalTypes: CanonicalLogicalTypes = []) {
        return new DictCanonical(value, logicalTypes);
    }

    private getMapItem(iterator: IterableIterator<[string, ICanonical | ICanonicalSource<T>]>): IMappingEntry | undefined {
        const result = iterator.next();
        if (result.done) {
            return undefined;
        }
        return {
            key: result.value[0],
            value: toCanonical(result.value[1]),
            next: () => {
                if (result.done) {
                    return undefined;
                }
                return this.getMapItem(iterator);
            }
        };
    }

    public equals(other?: ICanonical | ICanonicalSource<unknown>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!super.equals(other)) { return false; }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const otherDict = other!.asDict();
        const keys = Object.keys(this.value);
        const otherKeys = Object.keys(otherDict);
        if (otherKeys.length !== keys.length) { return false; }
        for (const key of keys) {
            const value = toCanonicalOrUndefined(this.value[key]);
            const otherValue = toCanonicalOrUndefined(otherDict[key]);
            if (value === undefined) {
                if (otherValue !== undefined) {
                    return false;
                }
            } else {
                if (!value.equals(otherValue)) {
                    return false;
                }
            }
        }
        return true;
    }
}
