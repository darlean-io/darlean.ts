import {
    CanonicalLike,
    CanonicalLogicalTypes,
    CanonicalPhysicalType,
    ICanonical,
    ICanonicalSource,
    IMappingEntry,
    ISequenceItem
} from './canonical';
import { toCanonical, toCanonicalOrUndefined } from './helpers';

/**
 * BaseCanonical is a base class for specific subtypes of ICanonical implementations. It should not be
 * instantiated directly.
 */
export abstract class BaseCanonical<T extends ICanonicalSource = ICanonicalSource> implements ICanonical<T>, ICanonicalSource {
    protected _physicalType: CanonicalPhysicalType = 'none';
    protected _logicalTypes: CanonicalLogicalTypes;

    constructor(physicalType: CanonicalPhysicalType, logicalTypes: CanonicalLogicalTypes) {
        this._physicalType = physicalType;
        this._logicalTypes = logicalTypes;
    }

    public _peekCanonicalRepresentation(): ICanonical<T> {
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

    public toString(): string {
        return `Canonical<${this._physicalType},${this._logicalTypes}>`;
    }

    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
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

    public is(base: CanonicalLike<T> | CanonicalLogicalTypes) {
        const subTypes = this._logicalTypes;
        const baseTypes = Array.isArray(base) ? base : toCanonical(base).logicalTypes;

        if (baseTypes.length > subTypes.length) {
            return false;
        }

        if (baseTypes.length === 0) {
            return true;
        }

        // It is usually most efficient to check that the deepest common match is
        // different or not. The shallowest parts are more likely to match.
        for (let idx = baseTypes.length - 1; idx >= 0; idx--) {
            if (baseTypes[idx] !== subTypes[idx]) {
                return false;
            }
        }

        return true;
    }

    public get size(): number {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a sequence or mapping`
        );
    }

    public getSequenceItem(_index: number): CanonicalLike<T> | undefined {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a sequence`
        );
    }

    public getMappingValue(_key: string): CanonicalLike<T> | undefined {
        throw new Error(
            `The canonical value with physical type "${this._physicalType}" and logical type(s) "${this._logicalTypes}" is not a mapping`
        );
    }

    public isCanonical(): this is ICanonical<T> {
        return true;
    }
}
