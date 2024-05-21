import { CanonicalLogicalTypes, CanonicalPhysicalType, ICanonical, IMappingEntry, ISequenceItem } from "./canonical";

/**
 * BaseCanonical is a base class for specific subtypes of ICanonical implementations. It should not be
 * instantiated directly.
 */
export class BaseCanonical implements ICanonical {
    protected _physicalType: CanonicalPhysicalType = 'none';
    protected _logicalTypes: CanonicalLogicalTypes;

    constructor(physicalType: CanonicalPhysicalType, logicalTypes: CanonicalLogicalTypes) {
        this._physicalType = physicalType;
        this._logicalTypes = logicalTypes;
    }

    public get physicalType(): CanonicalPhysicalType {
        return this._physicalType;
    }

    public get logicalTypes(): CanonicalLogicalTypes {
        return this._logicalTypes;
    }

    public get noneValue(): undefined {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a none`);
    }

    public get boolValue(): boolean {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a bool`);
    }

    public get intValue(): number {
        throw new Error(`The canonical value with type "${this._physicalType}" is not an int`);
    }

    public get floatValue(): number {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a float`);
    }

    public get stringValue(): string {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a string`);
    }

    public get momentValue(): Date {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a moment`);
    }

    public get binaryValue(): Buffer {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a binary`);
    }

    public get firstSequenceItem(): ISequenceItem | undefined {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a sequence`);
    }

    public get firstMappingEntry(): IMappingEntry | undefined {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a mapping`);
    }

    public asArray(): ICanonical[] {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a sequence`);
    }
    
    public asMap(): Map<string, ICanonical> {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a mapping`);
    }
    
    public asDict(): {[key: string]: ICanonical} {
        throw new Error(`The canonical value with type "${this._physicalType}" is not a mapping`);
    }
}
