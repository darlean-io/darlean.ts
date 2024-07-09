import {
    CanonicalLogicalTypes,
    CanonicalPhysicalType,
    ICanonical,
    ICanonicalSource,
    IMappingEntry,
    ISequenceItem
} from './canonical';
import { toCanonicalOrUndefined } from './helpers';

/**
 * BaseCanonical is a base class for specific subtypes of ICanonical implementations. It should not be
 * instantiated directly.
 */
export abstract class BaseCanonical<T = unknown> implements ICanonical, ICanonicalSource<T> {
    protected _physicalType: CanonicalPhysicalType = 'none';
    protected _logicalTypes: CanonicalLogicalTypes;

    constructor(physicalType: CanonicalPhysicalType, logicalTypes: CanonicalLogicalTypes) {
        this._physicalType = physicalType;
        this._logicalTypes = logicalTypes;
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return this;
    }

    public get physicalType(): CanonicalPhysicalType {
        return this._physicalType;
    }

    public get logicalTypes(): CanonicalLogicalTypes {
        return this._logicalTypes;
    }

    public get noneValue(): undefined {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a none`
        );
    }

    public get boolValue(): boolean {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a bool`
        );
    }

    public get intValue(): number {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not an int`
        );
    }

    public get floatValue(): number {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a float`
        );
    }

    public get stringValue(): string {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a string`
        );
    }

    public get momentValue(): Date {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a moment`
        );
    }

    public get binaryValue(): Buffer {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a binary`
        );
    }

    public get firstSequenceItem(): ISequenceItem | undefined {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a sequence`
        );
    }

    public get firstMappingEntry(): IMappingEntry | undefined {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a mapping`
        );
    }

    public asArray(): ICanonical[] {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a sequence`
        );
    }

    public asMap(): Map<string, ICanonical> {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a mapping`
        );
    }

    public asDict(): { [key: string]: ICanonical } {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a mapping`
        );
    }

    public toString(): string {
        return `Canonical<${this._physicalType},${this._logicalTypes}>`;
    }

    public equals(other?: ICanonical | ICanonicalSource<unknown>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!other) {
            return false;
        }
        if (other.physicalType !== this.physicalType) {
            return false;
        }
        if (other.logicalTypes[-1] !== this.logicalTypes[-1]) {
            return false;
        }
        return true;
    }
}
