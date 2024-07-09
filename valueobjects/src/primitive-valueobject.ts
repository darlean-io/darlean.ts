import {
    BinaryCanonical,
    BoolCanonical,
    FloatCanonical,
    ICanonical,
    ICanonicalSource,
    IntCanonical,
    MomentCanonical,
    NoneCanonical,
    StringCanonical,
    isCanonical
} from '@darlean/canonical';
import {
    NativePrimitive,
    IValueObject,
    IValueDef,
    CanonicalType,
    getValueObjectDef,
    isValueObject,
    deriveTypeName,
    IValueClass,
    NativeType,
    ValueObject
} from './valueobject';

export interface IPrimitiveValueClass<TNative extends NativePrimitive> {
    DEF: PrimitiveDef<TNative>;
}

export abstract class PrimitiveValue<TNative extends NativePrimitive> extends ValueObject implements IValueObject, ICanonicalSource<TNative> {
    protected _value: TNative;

    constructor(value: TNative, canonical: ICanonical | undefined) {
        super(canonical);
        const constr = this.constructor as unknown as IPrimitiveValueClass<TNative>;
        validatePrimitive(constr.DEF, value);
        this._value = value;
    }

    static required<T, X extends NativePrimitive>(this: new (value: X | ICanonical) => T): T {
        return { required: true, clazz: this } as unknown as T;
    }

    static optional<T, X extends NativePrimitive>(this: new (value: X | ICanonical) => T): T | undefined {
        return { required: false, clazz: this } as unknown as T;
    }

    public get value() {
        return this._value;
    }
}

export type PrimitiveValidator<T> = (value: T) => string | boolean | void | undefined;

export class PrimitiveDef<TNative extends NativePrimitive> implements IValueDef<TNative> {
    private _base?: PrimitiveDef<TNative>;
    private _types: CanonicalType[];
    private _validators: { validator: PrimitiveValidator<TNative>; description?: string }[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type?: CanonicalType) {
        this._template = template;
        this._types = [type ?? deriveTypeName(template.name)];
        this._validators = [];

        const proto = Object.getPrototypeOf(template);
        if (proto) {
            this.withBase(proto);
        }
    }

    public get types() {
        return this._types;
    }
    public get validators() {
        return this._validators;
    }
    public get template() {
        return this._template;
    }

    public withBase(base: IPrimitiveValueClass<TNative> | PrimitiveDef<TNative>): PrimitiveDef<TNative> {
        const base2 = base instanceof PrimitiveDef ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._base = base2;
        this._types = [...base2.types, ...this._types];
        this._validators = [...base2._validators, ...this._validators];
        return this;
    }

    public withValidator(validator: PrimitiveValidator<TNative>, description?: string): PrimitiveDef<TNative> {
        this._validators.push({ validator, description });
        return this;
    }

    public construct(value: TNative | ICanonical) {
        return Reflect.construct(this._template, [value, isCanonical(value) ? value : undefined]);
    }

    public from(value: TNative | ICanonical | IValueObject): IValueObject {
        const vo = isValueObject(value);
        const ourType = this._types.at(-1);
        if (vo) {
            const voDef = getValueObjectDef(vo);
            const incomingTypes = voDef.types;
            if (incomingTypes.length > 0 && ourType) {
                if (!incomingTypes.includes(ourType)) {
                    throw new Error(`Value object with type "${incomingTypes.join('.')}" is not compatible with "${ourType}"`);
                }
            }
            return vo;
        } else if ((value as ICanonical)?.logicalTypes) {
            const incomingTypes = (value as ICanonical).logicalTypes;
            if (incomingTypes.length > 0 && ourType) {
                if (!incomingTypes.includes(ourType)) {
                    throw new Error(
                        `Canonical object with type "${incomingTypes.join('.')}" is not compatible with "${ourType}"`
                    );
                }
            }
            return this.construct(value as ICanonical);
        }

        return this.construct(value as TNative);
    }

    public hasType(type: CanonicalType): boolean {
        return this._types.includes(type);
    }
}

/**
 * Validates a NATIVE representation of the primitive value.
 * @param def
 * @param value
 * @returns
 */
export function validatePrimitive<TNative extends NativePrimitive>(def: PrimitiveDef<TNative>, value: TNative): TNative {
    for (const validator of def.validators) {
        let result: string | boolean | undefined | void;
        try {
            result = validator.validator(value);
        } catch (e) {
            result = (e as Error).message ?? false;
        }

        if (result === true || result === '' || result === undefined) {
            continue;
        }
        
        if (typeof result === 'string') {
            throw new Error(`Invalid value for primitive of type "${def.types.at(-1)}": ${result}`);
        } else if (validator.description) {
            throw new Error(`Invalid value for primitive of type "${def.types.at(-1)}": ${validator.description}`);
        }
        throw new Error(`Invalid value for primitive of type "${def.types.at(-1)}"`);
    }
    return value;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function primitive<TNative extends NativePrimitive>(template: Function, type?: CanonicalType): PrimitiveDef<TNative> {
    const def = new PrimitiveDef<TNative>(template, type);
    (template as unknown as IPrimitiveValueClass<TNative>).DEF = def;
    return def;
}

export const stringv = primitive<string>;
export const nonev = primitive<undefined>;
export const intv = primitive<number>;
export const floatv = primitive<number>;
export const boolv = primitive<boolean>;
export const binaryv = primitive<Buffer>;
export const momentv = primitive<Date>;

/*// eslint-disable-next-line @typescript-eslint/ban-types
export function stringv(template: Function, type: CanonicalType): PrimitiveDef<string> {
    return primitive<string>(template, type);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function nonev(template: Function, type: CanonicalType): PrimitiveDef<undefined> {
    return primitive<string>(template, type);
}*/

export class NoneValue extends PrimitiveValue<undefined> {
    static DEF = primitive<string>(NoneValue, 'none').withValidator(
        (value) => typeof value === 'undefined',
        'Must be a undefined'
    );

    constructor(value: undefined | ICanonical) {
        if (typeof value === 'undefined') {
            super(value, undefined);
        }  else {
            super(value.noneValue, value);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return NoneCanonical.from((Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types);
    }
}

export class StringValue extends PrimitiveValue<string> {
    static DEF = primitive<string>(StringValue, 'string').withValidator((value) =>
        typeof value === 'string' ? true : `Must be a string, not ${typeof value}`
    );

    constructor(value: string | ICanonical) {
        if (typeof value === 'string') {
            super(value, undefined);
        } else {
            super(value.stringValue, value);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return StringCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof StringValue>(this: T, value: string): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }
}

export class IntValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(IntValue, 'int')
        .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
        .withValidator((value) => (Number.isInteger(value) ? true :`Must be an integer number, not ${value}`));

    constructor(value: number | ICanonical) {
        if (typeof value === 'number') {
            super(value, undefined);
        } else {
            super(value.intValue, value);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return IntCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof IntValue>(this: T, value: number): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }
}

export class FloatValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(FloatValue, 'float')
        .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
        .withValidator((value) => Number.isFinite(value), 'Must be finite')
        .withValidator((value) => !Number.isNaN(value), 'Must not be NaN');

    constructor(value: number | ICanonical) {
        if (typeof value === 'number') {
            super(value, undefined);
         } else {
            super(value.floatValue, undefined);
         }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return FloatCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof FloatValue>(this: T, value: number): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }
}

export class BoolValue extends PrimitiveValue<boolean> {
    static DEF = primitive<boolean>(BoolValue, 'bool').withValidator((value) =>
        typeof value === 'boolean' ? true : `Must be a boolean, not ${typeof value}`
    );

    constructor(value: boolean | ICanonical) {
        if (typeof value === 'boolean') {
            super(value, undefined);
        } else {
            super(value.boolValue, value);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return BoolCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof BoolValue>(this: T, value: boolean): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }
}

export class DurationValue extends FloatValue {}


export class MomentValue extends PrimitiveValue<Date> {
    static DEF = primitive<Date>(MomentValue, 'moment').withValidator((value) =>
        value instanceof Date ? true : `Must be a Date, not ${typeof value}`
    );

    constructor(value: Date | ICanonical) {
        if (value instanceof Date) {
            super(value, undefined);
        } else {
            super(value.momentValue, undefined);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return MomentCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof MomentValue>(this: T, value: Date): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }

    public addDuration(duration: DurationValue): this {
        return (this as unknown as IValueClass<NativeType, typeof this>).DEF.from(
            this._value.valueOf() + duration.value
        ) as this;
    }

    public subtractDuration(duration: DurationValue): this {
        return (this as unknown as IValueClass<NativeType, typeof this>).DEF.from(
            this._value.valueOf() - duration.value
        ) as this;
    }

    public equals(other: this | undefined): boolean {
        if (!super.equals(other)) { return false; }
        
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return (other!._value.valueOf() === this._value.valueOf());
    }
}

export class BinaryValue extends PrimitiveValue<Buffer> {
    static DEF = primitive<Buffer>(BinaryValue, 'binary').withValidator((value) =>
        value instanceof Buffer ? true : `Must be a Buffer, not ${typeof value}`
    );

    constructor(value: Buffer | ICanonical) {
        if (Buffer.isBuffer(value)) {
            super(value, undefined);
        } else {
            super((value as ICanonical)?.binaryValue, value);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return BinaryCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    public equals(other: this | undefined): boolean {
        if (!super.equals(other)) { return false; }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return (other!._value.equals(this._value));
    }

    static from<T extends typeof BinaryValue>(this: T, value: Buffer): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
    }
}
