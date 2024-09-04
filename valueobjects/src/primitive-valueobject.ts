import {
    BinaryCanonical,
    BoolCanonical,
    CanonicalLike,
    FloatCanonical,
    ICanonical,
    ICanonicalSource,
    IntCanonical,
    isCanonical,
    isCanonicalLike,
    MomentCanonical,
    NoneCanonical,
    StringCanonical,
    toCanonical
} from '@darlean/canonical';
import { ValidationError } from './valueobject';
import 'reflect-metadata';
import {
    checkLogicalTypes,
    Class,
    constructValue,
    IFromCanonicalOptions,
    IValueOptions,
    LOGICAL_TYPES,
    optional,
    required,
    shouldCacheCanonical,
    validation,
    ValidatorFunc,
    VALIDATORS,
    Value,
    valueobject
} from './base';
import { NoInfer } from './utils';

export abstract class PrimitiveValue<TPrimitive> extends Value implements ICanonicalSource {
    protected _value: TPrimitive;
    private _canonical?: ICanonical;

    public static from<T extends PrimitiveValue<TPrimitive>, TPrimitive = T extends PrimitiveValue<infer X> ? X : never>(
        this: Class<T>,
        value: NoInfer<TPrimitive>
    ) {
        const options: IValueOptions = {
            value
        };
        return Reflect.construct(this, [options]);
    }

    public static fromCanonical<T extends PrimitiveValue<TPrimitive>, TPrimitive = T extends PrimitiveValue<infer X> ? X : never>(
        this: Class<T>,
        value: CanonicalLike,
        options?: IFromCanonicalOptions
    ) {
        const valueoptions: IValueOptions = {
            canonical: value,
            cacheCanonical: options?.cacheCanonical
        };
        return Reflect.construct(this, [valueoptions]);
    }

    public static required<T>(this: Class<T>): T {
        return required<T>(this);
    }

    public static optional<T>(this: Class<T>): T | undefined {
        return optional<T>(this);
    }

    constructor(options: IValueOptions) {
        super(options);

        let v: TPrimitive | undefined;
        if (options.canonical) {
            const canonical = toCanonical(options.canonical);
            const logicalTypes = checkLogicalTypes(Object.getPrototypeOf(this));
            const canonicalLogicalTypes = canonical.logicalTypes;
            if (!canonical.is(logicalTypes)) {
                throw new ValidationError(
                    `Incoming value of logical types '${canonicalLogicalTypes.join(
                        '.'
                    )}' is not compatible with '${logicalTypes.join('.')}'`
                );
            }
            if (shouldCacheCanonical(canonical, logicalTypes, options?.cacheCanonical)) {
                this._canonical = canonical;
            }
            try {
                v = this._fromCanonical(canonical);
            } catch (e) {
                throw new ValidationError(e instanceof Error ? e.message : (e as string));
            }
        } else {
            v = options.value as TPrimitive;
        }
        const msgs: string[] = [];
        const validated = this._validate(v, (msg: string) => msgs.push(msg));
        if (msgs.length > 0) {
            throw new ValidationError(msgs.join('; '));
        }
        this._value = (validated ?? v) as TPrimitive;
    }

    public _peekCanonicalRepresentation(): ICanonical<this> {
        if (this._canonical) {
            return this._canonical;
        }
        const canonical = this._toCanonical(this.value, this._logicalTypes);
        this._canonical = canonical;
        return canonical;
    }

    public get value() {
        return this._value;
    }

    public get _logicalTypes() {
        return (Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this)) ?? []) as string[];
    }

    public equals(other: unknown): boolean {
        if (!isCanonicalLike(other)) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other);
    }

    protected abstract _fromCanonical(canonical: ICanonical): TPrimitive;
    protected abstract _toCanonical(value: TPrimitive, logicalTypes: string[]): ICanonical<this>;
    protected _validate(v: unknown, fail: (msg: string) => void): TPrimitive | void {
        const validators = Reflect.getOwnMetadata(VALIDATORS, Object.getPrototypeOf(this)) as ValidatorFunc[] | undefined;
        if (validators) {
            let failed = false;
            for (const validator of validators) {
                validator(v, (msg: string) => {
                    fail(msg);
                    failed = true;
                });
                if (failed) {
                    break;
                }
            }
        }
    }
}

export class StringValue extends PrimitiveValue<string> {
    protected _fromCanonical(canonical: ICanonical): string {
        return canonical.stringValue;
    }

    protected _toCanonical(value: string, logicalTypes: string[]): ICanonical<this> {
        return StringCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): string | void {
        if (typeof v !== 'string') {
            return fail(`Must be a string; not ${typeof v}`);
        }
        super._validate(v, fail);
    }
}
export const stringvalue = valueobject;
export const stringvalidation = validation<string>;
stringvalue('')(StringValue);

export class IntValue extends PrimitiveValue<number> {
    protected _fromCanonical(canonical: ICanonical): number {
        return canonical.intValue;
    }

    protected _toCanonical(value: number, logicalTypes: string[]): ICanonical<this> {
        return IntCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): number | void {
        if (typeof v !== 'number') {
            return fail(`Must be a number; not ${typeof v}`);
        }
        if (!Number.isInteger(v)) {
            return fail(`Must be an integer number; not ${v}`);
        }
        super._validate(v, fail);
    }
}
export const intvalue = valueobject;
export const intvalidation = validation<number>;
intvalue('')(IntValue);

export class FloatValue extends PrimitiveValue<number> {
    protected _fromCanonical(canonical: ICanonical): number {
        return canonical.floatValue;
    }

    protected _toCanonical(value: number, logicalTypes: string[]): ICanonical<this> {
        return FloatCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): number | void {
        if (typeof v !== 'number') {
            return fail(`Must be a number; not ${typeof v}`);
        }
        if (!Number.isFinite(v)) {
            return fail(`Must be a finite number; not ${v}`);
        }
        if (Number.isNaN(v)) {
            return fail(`Must be a finite number; not ${v}`);
        }
        super._validate(v, fail);
    }
}
export const floatvalue = valueobject;
export const floatvalidation = validation<number>;
floatvalue('')(FloatValue);

export class NoneValue extends PrimitiveValue<undefined> {
    protected _fromCanonical(canonical: ICanonical): undefined {
        return canonical.noneValue;
    }

    protected _toCanonical(_value: undefined, logicalTypes: string[]): ICanonical<this> {
        return NoneCanonical.from(logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): undefined | void {
        if (typeof v !== 'undefined') {
            return fail(`Must be undefined; not ${typeof v}`);
        }
        super._validate(v, fail);
    }
}
export const nonevalue = valueobject;
export const nonevalidation = validation<undefined>;
nonevalue('')(NoneValue);

export class BoolValue extends PrimitiveValue<boolean> {
    protected _fromCanonical(canonical: ICanonical): boolean {
        return canonical.boolValue;
    }

    protected _toCanonical(value: boolean, logicalTypes: string[]): ICanonical<this> {
        return BoolCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): boolean | void {
        if (typeof v !== 'boolean') {
            return fail(`Must be a boolean; not ${typeof v}`);
        }
        super._validate(v, fail);
    }
}
export const boolvalue = valueobject;
export const boolvalidation = validation<boolean>;
boolvalue('')(BoolValue);

export class DurationValue extends FloatValue {}
floatvalue('')(DurationValue);

export class MomentValue extends PrimitiveValue<Date> {
    protected _fromCanonical(canonical: ICanonical): Date {
        return canonical.momentValue;
    }

    protected _toCanonical(value: Date, logicalTypes: string[]): ICanonical<this> {
        return MomentCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): Date | void {
        if (!(v instanceof Date)) {
            return fail(`Must be a Date; not ${typeof v}`);
        }
        super._validate(v, fail);
    }

    public get ms() {
        return this._value.valueOf();
    }

    public static fromMilliseconds<T extends Class<MomentValue>>(this: T, ms: number) {
        return constructValue(this, { value: new Date(ms) });
    }

    public addDuration(duration: DurationValue): this {
        return constructValue(Object.getPrototypeOf(this), { value: new Date(this._value.valueOf() + duration.value) });
    }

    public subtractDuration(duration: DurationValue): this {
        return constructValue(Object.getPrototypeOf(this), { value: new Date(this._value.valueOf() - duration.value) });
    }
}
export const momentvalue = valueobject;
export const momentvalidation = validation<Date>;
momentvalue('')(MomentValue);

export class BinaryValue extends PrimitiveValue<Buffer> {
    protected _fromCanonical(canonical: ICanonical): Buffer {
        return canonical.binaryValue;
    }

    protected _toCanonical(value: Buffer, logicalTypes: string[]): ICanonical<this> {
        return BinaryCanonical.from(value, logicalTypes);
    }

    protected _validate(v: unknown, fail: (msg: string) => void): Buffer | void {
        if (!Buffer.isBuffer(v)) {
            return fail(`Must be a Buffer; not ${typeof v}`);
        }
        super._validate(v, fail);
    }
}
export const binaryvalue = valueobject;
export const binaryvalidation = validation<Buffer>;
binaryvalue('')(BinaryValue);

export class CanonicalValue extends PrimitiveValue<ICanonical> {
    protected _fromCanonical(canonical: ICanonical): ICanonical {
        return canonical;
    }

    protected _toCanonical(value: ICanonical, _logicalTypes: string[]): ICanonical<this> {
        return value;
    }

    protected _validate(v: unknown, fail: (msg: string) => void): ICanonical | void {
        if (!isCanonical(v)) {
            return fail(`Must be an ICanonical; not ${typeof v}`);
        }
        super._validate(v, fail);
    }
}
export const canonicalvalue = valueobject;
export const canonicalvalidation = validation<ICanonical>;
canonicalvalue('')(CanonicalValue);
