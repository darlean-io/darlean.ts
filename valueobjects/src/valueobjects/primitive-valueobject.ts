import { ICanonical, ICanonicalSource } from "../canonical/base";
import { BinaryCanonical, BoolCanonical, FloatCanonical, IntCanonical, MomentCanonical, NoneCanonical, StringCanonical } from "../canonical/primitives";
import { NativePrimitive, IValueObject, IValueDef, CanonicalType, getValueObjectDef, isValueObject } from "./valueobject";

export interface IPrimitiveValueClass<TNative extends NativePrimitive> {
    DEF: PrimitiveDef<TNative>;
}

export abstract class PrimitiveValue<TNative extends NativePrimitive> implements IValueObject, ICanonicalSource {
    protected _value: TNative;

    constructor(value: TNative) {
        const proto = (this.constructor as unknown as IPrimitiveValueClass<TNative>);
        validatePrimitive(proto.DEF, value);
        this._value = value;
    }

    public get value() { return this._value }


    public abstract _peekCanonicalRepresentation(): ICanonical;
}

export type PrimitiveValidator<T> = (value: T) => string | boolean | undefined;

export class PrimitiveDef<TNative extends NativePrimitive> implements IValueDef<TNative> {
    private _base?: PrimitiveDef<TNative>;
    private _types: CanonicalType[];
    private _validators: { validator: PrimitiveValidator<TNative>, description?: string}[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type: CanonicalType) {
        this._template = template;
        this._types = [type];
        this._validators = [];

        const proto = Object.getPrototypeOf(template);
        if (proto) {
            this.withBase(proto);
        }
    }

    public get types() { return this._types; }
    public get validators() { return this._validators; }

    public withBase(base: IPrimitiveValueClass<TNative> | PrimitiveDef<TNative>): PrimitiveDef<TNative> {
        const base2 = (base instanceof PrimitiveDef) ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._base = base2;
        this._types = [...base2.types, ...this._types];
        this._validators = [...base2._validators, ...this._validators];
        return this;
    }

    public withValidator(validator: PrimitiveValidator<TNative>, description?: string): PrimitiveDef<TNative> {
        this._validators.push({validator, description});
        return this;
    }

    public construct(value: TNative | ICanonical) {
        return Reflect.construct(this._template, [value]);
    }

    public from(value: TNative | ICanonical | IValueObject): IValueObject {
        const vo = isValueObject(value);
        if (vo) {
            const ourType = this._types.at(-1);
            const voDef = getValueObjectDef(vo);
            if (ourType && voDef.hasType(ourType)) {
                return vo;
            }
        }
        return this.construct(value as TNative | ICanonical);
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
        if ((result === true) || (result === '') || (result === undefined)) {
            continue;
        }
        if (typeof result === 'string') {
            throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}: ${result}`);
        } else
        if (validator.description) {
            throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}: ${validator.description}`);
        }
        throw new Error(`Invalid value for primitive of type ${def.types.at(-1)}`);
    }
    return value;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function primitive<TNative extends NativePrimitive>(template: Function, type: CanonicalType): PrimitiveDef<TNative> {
    const def = new PrimitiveDef<TNative>(template, type);
    (template as unknown as IPrimitiveValueClass<TNative>).DEF = def;
    return def;
}

export const stringv = primitive<string>;
export const nonev = primitive<undefined>;
export const intv = primitive<number>;
export const floatv = primitive<number>;
export const boolv = primitive<boolean>;
export const binaryv = primitive<Uint8Array>;
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
    static DEF = primitive<string>(NoneValue, 'none')
      .withValidator((value) => typeof value === 'undefined', 'Must be a undefined');

    constructor(value: undefined | ICanonical) {
        super(typeof value === 'undefined' ? value : value.noneValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new NoneCanonical();
    }
}

export class StringValue extends PrimitiveValue<string> {
    static DEF = primitive<string>(StringValue, 'string')
      .withValidator((value) => typeof value === 'string', 'Must be a string');

    constructor(value: string | ICanonical) {
        super(typeof value === 'string' ? value : value.stringValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new StringCanonical(this._value);
    }
}

export class IntValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(IntValue, 'int')
      .withValidator((value) => typeof value === 'number', 'Must be a number')
      .withValidator((value) => Number.isInteger(value), 'Must be an integer');

    constructor(value: number | ICanonical) {
        super(typeof value === 'number' ? value : value.intValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new IntCanonical(this._value);
    }
}

export class FloatValue extends PrimitiveValue<number> {
    static DEF = primitive<number>(FloatValue, 'float')
      .withValidator((value) => typeof value === 'number', 'Must be a number')
      .withValidator((value) => Number.isFinite(value), 'Must be finite')
      .withValidator((value) => !Number.isNaN(value), 'Must not be NaN');
      
    constructor(value: number | ICanonical) {
        super(typeof value === 'number' ? value : value.floatValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new FloatCanonical(this._value);
    }
}

export class BoolValue extends PrimitiveValue<boolean> {
    static DEF = primitive<boolean>(BoolValue, 'bool')
    .withValidator((value) => typeof value === 'boolean', 'Must be a boolean');

    constructor(value: boolean | ICanonical) {
        super(typeof value === 'boolean' ? value : value.boolValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new BoolCanonical(this._value);
    }
}

export class MomentValue extends PrimitiveValue<Date> {
    static DEF = primitive<Date>(MomentValue, 'moment')
    .withValidator((value) => value instanceof Date, 'Must be a Date')

    constructor(value: Date | ICanonical) {
        super(value instanceof Date ? value : value.momentValue);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new MomentCanonical(this._value);
    }
}

export class BinaryValue extends PrimitiveValue<Uint8Array> {
    static DEF = primitive<Uint8Array>(BinaryValue, 'binary')
    .withValidator((value) => Array.isArray(value), 'Must be an array');

    constructor(value: Uint8Array | ICanonical) {
        if (Array.isArray(value)) {
            super(value as Uint8Array);
        } else {
            super((value as ICanonical).binaryValue);
        }
    }

    public _peekCanonicalRepresentation(): ICanonical {
        return new BinaryCanonical(this._value);
    }
}
