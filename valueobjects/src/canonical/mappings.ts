import { BaseCanonical, CanonicalLogicalTypes, ICanonical, ICanonicalSource, IMappingItem } from "./base";

export class MapCanonical extends BaseCanonical {
    constructor(private value: Map<string, ICanonical | ICanonicalSource>, logicalTypes: CanonicalLogicalTypes = []) { super('mapping', logicalTypes); }
    
    public get firstMappingItem(): IMappingItem | undefined {
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

    public asDict(): {[key: string]: ICanonical} {
        const result: {[key: string]: ICanonical} = {};
        for (const entry of this.value.entries()) {
            result[entry[0]] = toCanonical(entry[1]);
        }
        return result;
    }

    private getMapItem(iterator: IterableIterator<[string, ICanonical | ICanonicalSource]>): IMappingItem | undefined {
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
        }
    }
}

export function toCanonical(value: ICanonical | ICanonicalSource) {
    if ((value as ICanonicalSource)._peekCanonicalRepresentation) {
        return (value as ICanonicalSource)._peekCanonicalRepresentation();
    }
    return value as ICanonical;
}

export class DictCanonical extends BaseCanonical {
    constructor(private value: {[key: string]: ICanonical}, logicalTypes: CanonicalLogicalTypes = []) { super('mapping', logicalTypes); }
    
    public get firstMappingItem(): IMappingItem | undefined {
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

    public asDict(): {[key: string]: ICanonical} {
        const result: {[key: string]: ICanonical} = {};
        for (const entry of Object.entries(this.value)) {
            result[entry[0]] = toCanonical(entry[1]);
        }
        return result;
    }

    private getMapItem(iterator: IterableIterator<[string, ICanonical]>): IMappingItem | undefined {
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
        }
    }
}
