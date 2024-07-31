import { BaseCanonical } from './base-canonical';
import { CanonicalLogicalTypes, ICanonical, ICanonicalSource } from './canonical';
import { toCanonicalOrUndefined } from './helpers';

export class NoneCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(logicalTypes: CanonicalLogicalTypes = []) {
        super('none', logicalTypes);
    }
    public static from(logicalTypes: CanonicalLogicalTypes = []) {
        return new NoneCanonical(logicalTypes);
    }
    public get noneValue(): undefined {
        return undefined;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.noneValue === undefined;
    }
}

export class BoolCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: boolean, logicalTypes: CanonicalLogicalTypes = []) {
        super('bool', logicalTypes);
    }
    public static from(value: boolean, logicalTypes: CanonicalLogicalTypes = []) {
        return new BoolCanonical(value, logicalTypes);
    }
    public get boolValue(): boolean {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.boolValue === this.boolValue;
    }
}

export class IntCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: number, logicalTypes: CanonicalLogicalTypes = []) {
        super('int', logicalTypes);
    }
    public static from(value: number, logicalTypes: CanonicalLogicalTypes = []) {
        return new IntCanonical(value, logicalTypes);
    }
    public get intValue(): number {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.intValue === this.intValue;
    }
}

export class FloatCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: number, logicalTypes: CanonicalLogicalTypes = []) {
        super('float', logicalTypes);
    }
    public static from(value: number, logicalTypes: CanonicalLogicalTypes = []) {
        return new FloatCanonical(value, logicalTypes);
    }
    public get floatValue(): number {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.floatValue === this.floatValue;
    }
}

export class StringCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: string, logicalTypes: CanonicalLogicalTypes = []) {
        super('string', logicalTypes);
    }
    public static from(value: string, logicalTypes: CanonicalLogicalTypes = []) {
        return new StringCanonical(value, logicalTypes);
    }
    public get stringValue(): string {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.stringValue === this.stringValue;
    }
}

export class MomentCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: Date, logicalTypes: CanonicalLogicalTypes = []) {
        super('moment', logicalTypes);
    }
    public static from(value: Date | number, logicalTypes: CanonicalLogicalTypes = []) {
        return new MomentCanonical(typeof value === 'number' ? new Date(value) : value, logicalTypes);
    }
    public get momentValue(): Date {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.momentValue.valueOf() === this.momentValue.valueOf();
    }
}

export class BinaryCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: Buffer | ArrayBuffer, logicalTypes: CanonicalLogicalTypes = []) {
        super('binary', logicalTypes);
    }
    public static from(value: Buffer, logicalTypes: CanonicalLogicalTypes = []) {
        return new BinaryCanonical(value, logicalTypes);
    }
    public get binaryValue(): Buffer {
        return Buffer.isBuffer(this.value) ? this.value : Buffer.from(this.value);
    }
    public get binaryValueAsArrayBuffer(): ArrayBuffer {
        return this.value;
    }
    public equals(other?: ICanonical<T> | ICanonicalSource): boolean {
        const other2 = toCanonicalOrUndefined(other);
        if (!super.equals(other2)) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return other2!.binaryValue.equals(this.binaryValue);
    }
}
