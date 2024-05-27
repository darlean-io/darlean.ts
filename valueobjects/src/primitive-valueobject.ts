import {
    BinaryCanonical,
    BoolCanonical,
    FloatCanonical,
    ICanonical,
    ICanonicalSource,
    IntCanonical,
    MomentCanonical,
    NoneCanonical,
    StringCanonical
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
    NativeType
} from './valueobject';

export interface IPrimitiveValueClass<TNative extends NativePrimitive> {
    DEF: PrimitiveDef<TNative>;
}

export abstract class PrimitiveValue<TNative extends NativePrimitive> implements IValueObject, ICanonicalSource<TNative> {
    protected _value: TNative;

    constructor(value: TNative) {
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

    //static optional<T extends typeof PrimitiveValue<NativePrimitive>>(this: T): InstanceType<T> | undefined {
    //    return undefined;
    //}

    public get value() {
        return this._value;
    }

    public abstract _peekCanonicalRepresentation(): ICanonical;
}

export type PrimitiveValidator<T> = (value: T) => string | boolean | undefined;

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
        return Reflect.construct(this._template, [value]);
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
        const result = validator.validator(value);
        if (result === true || result === '' || result === undefined) {
            continue;
        }
        if (typeof result === 'string') {
            throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}: ${result}`);
        } else if (validator.description) {
            throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}: ${validator.description}`);
        }
        throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}`);
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
        super(typeof value === 'undefined' ? value : value?.noneValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return NoneCanonical.from((Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types);
    }
}

export class StringValue extends PrimitiveValue<string> {
    static DEF = primitive<string>(StringValue, 'string').withValidator((value) =>
        typeof value === 'string' ? true : `Must be a string, not ${typeof value}`
    );

    constructor(value: string | ICanonical) {
        super(typeof value === 'string' ? value : value?.stringValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return StringCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof StringValue>(this: T, value: string): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}

export class IntValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(IntValue, 'int')
        .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
        .withValidator((value) => Number.isInteger(value), 'Must be an integer');

    constructor(value: number | ICanonical) {
        super(typeof value === 'number' ? value : value?.intValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return IntCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof IntValue>(this: T, value: number): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}

export class FloatValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(FloatValue, 'float')
        .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
        .withValidator((value) => Number.isFinite(value), 'Must be finite')
        .withValidator((value) => !Number.isNaN(value), 'Must not be NaN');

    constructor(value: number | ICanonical) {
        super(typeof value === 'number' ? value : value?.floatValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return FloatCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof FloatValue>(this: T, value: number): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}

export class BoolValue extends PrimitiveValue<boolean> {
    static DEF = primitive<boolean>(BoolValue, 'bool').withValidator((value) =>
        typeof value === 'boolean' ? true : `Must be a boolean, not ${typeof value}`
    );

    constructor(value: boolean | ICanonical) {
        super(typeof value === 'boolean' ? value : value?.boolValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return BoolCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof BoolValue>(this: T, value: boolean): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}

export class MomentValue extends PrimitiveValue<Date> {
    static DEF = primitive<Date>(MomentValue, 'moment').withValidator((value) =>
        value instanceof Date ? true : `Must be a Date, not ${typeof value}`
    );

    constructor(value: Date | ICanonical) {
        super(value instanceof Date ? value : value?.momentValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return MomentCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof MomentValue>(this: T, value: Date): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}

export class BinaryValue extends PrimitiveValue<Buffer> {
    static DEF = primitive<Buffer>(BinaryValue, 'binary').withValidator((value) =>
        value instanceof Buffer ? true : `Must be a Buffer, not ${typeof value}`
    );

    constructor(value: Buffer | ICanonical) {
        if (Buffer.isBuffer(value)) {
            super(value);
        } else {
            super((value as ICanonical)?.binaryValue);
        }
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return BinaryCanonical.from(
            this._value,
            (Object.getPrototypeOf(this).constructor as IPrimitiveValueClass<undefined>).DEF.types
        );
    }

    static from<T extends typeof BinaryValue>(this: T, value: Buffer): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }
}
