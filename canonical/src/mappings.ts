import { BaseCanonical } from './base-canonical';
import { CanonicalLogicalTypes, ICanonical, ICanonicalSource, IMappingEntry } from './canonical';

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

export function toCanonical<T = unknown>(value: ICanonical | ICanonicalSource<T>) {
    if ((value as ICanonicalSource<T>)._peekCanonicalRepresentation) {
        return (value as ICanonicalSource<T>)._peekCanonicalRepresentation();
    }
    return value as ICanonical;
}

/**
 * MapCanonical represents a canonical value backed by a dictionary. The dictionary must not be modified anymore.
 */

export class DictCanonical extends BaseCanonical {
    private constructor(private value: { [key: string]: ICanonical }, logicalTypes: CanonicalLogicalTypes = []) {
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

    public static from(value: { [key: string]: ICanonical }, logicalTypes: CanonicalLogicalTypes = []) {
        return new DictCanonical(value, logicalTypes);
    }

    private getMapItem(iterator: IterableIterator<[string, ICanonical]>): IMappingEntry | undefined {
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
