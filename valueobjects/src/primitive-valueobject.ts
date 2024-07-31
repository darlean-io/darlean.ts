import {
    BinaryCanonical,
    BoolCanonical,
    CanonicalLike,
    FloatCanonical,
    ICanonical,
    IntCanonical,
    MomentCanonical,
    NoneCanonical,
    StringCanonical,
    isCanonical,
    toCanonical
} from '@darlean/canonical';
import {
    IValueDef,
    CanonicalType,
    deriveTypeName,
    BaseValueObject,
    Value,
    ValueClass,
    Class,
    ValidationError
} from './valueobject';
import { getDefinitionForClass, valueDefIs, setDefinitionForClass, typesIs } from './utils';

export abstract class PrimitiveValue<TNative, TFrom = TNative> extends BaseValueObject {
    protected _value: TNative;

    protected constructor(
        def: PrimitiveDef<TNative, TFrom, ValueClass<PrimitiveValue<TNative>>>,
        canonical: CanonicalLike | undefined,
        value: TNative
    ) {
        super(def, canonical);
        this._value = def.validate(value);
    }

    static required<T>(this: Class<T>): T {
        return { required: true, clazz: this } as unknown as T;
    }

    static optional<T>(this: Class<T>): T | undefined {
        return { required: false, clazz: this } as unknown as T;
    }

    public static _def<
        T extends PrimitiveValue<TNative, TFrom>,
        TNative = T extends PrimitiveValue<infer X> ? X : never,
        TFrom = T extends PrimitiveValue<TNative, infer Y extends TNative> ? Y : never
    >(this: Class<T>) {
        return getDefinitionForClass(this) as PrimitiveDef<TNative, TFrom, Class<T>>;
    }

    //public static from<T extends PrimitiveValue<TNative>, TNative = T extends PrimitiveValue<infer X> ? X : never>(this: Class<T>, value: NoInfer<TNative> | ICanonical | Value): T {
    public static from<
        T extends PrimitiveValue<TNative, TFrom>,
        TNative = T extends PrimitiveValue<infer X> ? X : never,
        TFrom extends TNative = T extends PrimitiveValue<TNative, infer Y extends TNative> ? Y : never
    >(this: Class<T>, value: TFrom | ICanonical | Value) {
        //        public static from<T extends PrimitiveValue<TNative>, TNative = T extends PrimitiveValue<infer X> ? X : never>(this: Class<T>, value: TFrom): T {
        const def = getDefinitionForClass(this) as PrimitiveDef<TNative, TFrom, Class<T>>; // Removed: NoInfer
        return def.from(value);
    }

    public get value() {
        return this._value;
    }

    public get _def(): PrimitiveDef<TNative, TFrom, Class<this>> {
        return super._def as PrimitiveDef<TNative, TFrom, Class<this>>;
    }
}

export type PrimitiveValidator<T> = (value: T) => string | boolean | void | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class PrimitiveDef<TNative = unknown, TFrom = TNative, TValueClass extends ValueClass = ValueClass>
    implements IValueDef<TValueClass, TNative, TFrom>
{
    private _types: CanonicalType[];
    private _ownTypes: CanonicalType[];
    private _validators: { validator: PrimitiveValidator<TNative>; description?: string }[];
    private _valueClass: TValueClass;
    private _baseDef?: PrimitiveDef<TNative, TFrom, ValueClass>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(valueClass: TValueClass, type?: CanonicalType) {
        this._valueClass = valueClass;
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(valueClass.name)];
        this._types = this._ownTypes;
        this._validators = [];

        const proto = Object.getPrototypeOf(valueClass);
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
        return this._valueClass;
    }

    public abstract fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass>;

    public is(base: IValueDef): boolean {
        return valueDefIs(this, base);
    }

    public withBase<TBaseClass extends ValueClass>(base: TBaseClass): PrimitiveDef<TNative, TFrom, TValueClass> {
        const def = getDefinitionForClass(base);
        if (!def) {
            // Somewhere high enough up the inheritance chain we may encounter a base object without a def.
            // Maybe we should fix that and then raise an exception if that happens, but for now,
            // let's silently return.
            return this;
        }

        const baseDef = (this._baseDef = def as PrimitiveDef<TNative, TFrom, TBaseClass>);
        this._types = [...baseDef.types, ...this._ownTypes];
        this._validators = [...baseDef._validators, ...this._validators];
        return this;
    }

    public withType(type: string) {
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(this._valueClass.name)];
        this._types = this._baseDef ? [...this._baseDef.types, ...this._ownTypes] : this._ownTypes;
    }

    public withValidator(validator: PrimitiveValidator<TNative>, description?: string): PrimitiveDef<TNative, TFrom> {
        this._validators.push({ validator, description });
        return this;
    }

    /**
     * Construct a new value instance. The values are directly passed to the constructor.
     * @param canonical Optional canonical that is cached and returned by _peekCanonicalRepresentation
     * @param value The value (a native value) for the new instance.
     */
    public construct(canonical: ICanonical | undefined, value: TNative | undefined): InstanceType<TValueClass> {
        return Reflect.construct(this._valueClass, [this, canonical, value]) as InstanceType<TValueClass>;
    }

    public hasType(type: CanonicalType): boolean {
        return this._types.includes(type);
    }

    public validate(value: TNative): TNative {
        for (const validator of this._validators) {
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
                throw new ValidationError(`Invalid value for primitive of type "${this._types.at(-1)}": ${result}`);
            } else if (validator.description) {
                throw new ValidationError(
                    `Invalid value for primitive of type "${this._types.at(-1)}": ${validator.description}`
                );
            }
            throw new ValidationError(`Invalid value for primitive of type "${this._types.at(-1)}"`);
        }
        return value;
    }

    public from(value: TFrom | ICanonical | Value): InstanceType<TValueClass> {
        if (value instanceof Value) {
            if (Object.getPrototypeOf(value) === this) {
                return value as InstanceType<TValueClass>;
            }

            const voDef = value._def;
            if (!voDef.is(this)) {
                throw new Error(
                    `Value object with type "${voDef.types.join('.')}" is not compatible with "${this.types.join('.')}"`
                );
            }
            return value as InstanceType<TValueClass>;
        } else if (isCanonical(value)) {
            return this.fromCanonical(value);
        }

        return this.construct(undefined, this.convertFromToNative(value));
    }

    protected convertFromToNative(value: TFrom): TNative {
        return value as unknown as TNative;
    }
}

function extractFromCanonical<TNativeType, TFrom extends TNativeType, TValueClass extends ValueClass>(
    value: CanonicalLike,
    def: PrimitiveDef<TNativeType, TFrom, TValueClass>,
    extractor: (c: ICanonical) => TNativeType
) {
    const c = toCanonical(value);
    if (!typesIs(c.logicalTypes, def.types)) {
        throw new ValidationError(
            `Canonical object with type "${c.logicalTypes.join('.')}" is not compatible with "${def.types.join('.')}"`
        );
    }

    let extracted: TNativeType | undefined;
    try {
        extracted = extractor(c);
    } catch (e) {
        if (e instanceof Error) {
            throw new ValidationError(e.message);
        }
        throw e;
    }
    return def.construct(c, extracted);
}

export class NoneDef<TValueClass extends Class<NoneValue> = Class<NoneValue>> extends PrimitiveDef<
    undefined,
    undefined,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.noneValue);
    }
}

export class StringDef<TValueClass extends Class<StringValue> = Class<StringValue>> extends PrimitiveDef<
    string,
    string,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.stringValue);
    }
}

export class IntDef<TValueClass extends Class<IntValue> = Class<IntValue>> extends PrimitiveDef<number, number, TValueClass> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.intValue);
    }
}

export class FloatDef<TValueClass extends Class<FloatValue> = Class<FloatValue>> extends PrimitiveDef<
    number,
    number,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.floatValue);
    }
}

export class BoolDef<TValueClass extends Class<BoolValue> = Class<BoolValue>> extends PrimitiveDef<
    boolean,
    boolean,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.boolValue);
    }
}

export class MomentDef<TValueClass extends Class<MomentValue> = Class<MomentValue>> extends PrimitiveDef<
    Date,
    Date | number,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.momentValue);
    }

    //protected convertFromToNative(value: number | Date): Date {
    //    return (typeof value === 'number') ? new Date(value) : value;
    //}
}

export class BinaryDef<TValueClass extends Class<BinaryValue> = Class<BinaryValue>> extends PrimitiveDef<
    Buffer,
    Buffer,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c.binaryValue);
    }
}

export class CanonicalDef<TValueClass extends Class<CanonicalValue> = Class<CanonicalValue>> extends PrimitiveDef<
    ICanonical,
    ICanonical,
    TValueClass
> {
    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        return extractFromCanonical(value, this, (c) => c);
    }
}

////////////// Helpers ////////////////

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureStringDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new StringDef<typeof StringValue>(constructor as typeof StringValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<string, typeof StringValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureIntDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(constructor as ValueClass, new IntDef<typeof IntValue>(constructor as typeof IntValue, type));
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<number, typeof IntValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureFloatDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new FloatDef<typeof FloatValue>(constructor as typeof FloatValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<number, typeof FloatValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureBoolDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new BoolDef<typeof BoolValue>(constructor as typeof BoolValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<boolean, typeof BoolValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureMomentDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new MomentDef<typeof MomentValue>(constructor as typeof MomentValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<Date, typeof MomentValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureBinaryDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new BinaryDef<typeof BinaryValue>(constructor as typeof BinaryValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<Buffer, typeof BinaryValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureNoneDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new NoneDef<typeof NoneValue>(constructor as typeof NoneValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<Buffer, typeof BinaryValue>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureCanonicalDefForConstructor(constructor: Function, type?: string) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new CanonicalDef<typeof CanonicalValue>(constructor as typeof CanonicalValue, type)
        );
    } else if (type !== undefined) {
        (def as PrimitiveDef).withType(type);
    }
    return def as PrimitiveDef<ICanonical, typeof CanonicalValue>;
}

export class NoneValue extends PrimitiveValue<undefined> {
    constructor(def: NoneDef, canonical: ICanonical | undefined, value: undefined | ICanonical) {
        if (typeof value === 'undefined') {
            super(def, canonical, value);
        } else {
            super(def, canonical, value.noneValue);
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return NoneCanonical.from(this._def.types);
    }
}
ensureNoneDefForConstructor(NoneValue, '').withValidator((value) => typeof value === 'undefined', 'Must be a undefined');

export class StringValue extends PrimitiveValue<string> {
    constructor(def: StringDef, canonical: ICanonical | undefined, value: string) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return StringCanonical.from(this.value, this._def.types);
    }
}
ensureStringDefForConstructor(StringValue, '').withValidator((value) =>
    typeof value === 'string' ? true : `Must be a string, not ${typeof value}`
);

export class IntValue extends PrimitiveValue<number> {
    constructor(def: IntDef, canonical: ICanonical | undefined, value: number) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return IntCanonical.from(this._value, this._def.types);
    }
}
ensureIntDefForConstructor(IntValue, '')
    .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
    .withValidator((value) => (Number.isInteger(value) ? true : `Must be an integer number, not ${value}`));

export class FloatValue extends PrimitiveValue<number> {
    constructor(def: FloatDef, canonical: ICanonical | undefined, value: number) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return FloatCanonical.from(this._value, this._def.types);
    }
}
ensureFloatDefForConstructor(FloatValue, '')
    .withValidator((value) => (typeof value === 'number' ? true : `Must be a number, not ${typeof value}`))
    .withValidator((value) => Number.isFinite(value), 'Must be finite')
    .withValidator((value) => !Number.isNaN(value), 'Must not be NaN');

export class BoolValue extends PrimitiveValue<boolean> {
    constructor(def: BoolDef, canonical: ICanonical | undefined, value: boolean) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return BoolCanonical.from(this._value, this._def.types);
    }
}
ensureBoolDefForConstructor(BoolValue, '').withValidator((value) =>
    typeof value === 'boolean' ? true : `Must be a boolean, not ${typeof value}`
);

export class DurationValue extends FloatValue {}

export class MomentValue extends PrimitiveValue<Date, Date> {
    constructor(def: MomentDef, canonical: ICanonical | undefined, value: Date) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return MomentCanonical.from(this._value, this._def.types);
    }

    static fromMs<T extends Class<MomentValue>>(this: T, value: number): InstanceType<T> {
        const def = getDefinitionForClass(this) as MomentDef<T>;
        return def.from(new Date(value));
    }

    public get ms() {
        return this.value.valueOf();
    }

    public addDuration(duration: DurationValue): this {
        return this._def.construct(undefined, new Date(this._value.valueOf() + duration.value));
    }

    public subtractDuration(duration: DurationValue): this {
        return this._def.construct(undefined, new Date(this._value.valueOf() - duration.value));
    }
}
ensureMomentDefForConstructor(MomentValue, '').withValidator((value) =>
    value instanceof Date ? true : `Must be a Date, not ${typeof value}`
);

export class BinaryValue extends PrimitiveValue<Buffer> {
    constructor(def: BinaryDef, canonical: ICanonical | undefined, value: Buffer) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return BinaryCanonical.from(this._value, this._def.types);
    }
}
ensureBinaryDefForConstructor(BinaryValue, '').withValidator((value) =>
    value instanceof Buffer ? true : `Must be a Buffer, not ${typeof value}`
);

export class CanonicalValue extends PrimitiveValue<ICanonical> {
    constructor(def: CanonicalDef, canonical: ICanonical | undefined, value: ICanonical) {
        super(def, canonical, value);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        return this._value;
    }
}
ensureCanonicalDefForConstructor(CanonicalValue, '').withValidator((value) =>
    isCanonical(value) ? true : `Must be a ICanonical, not ${typeof value}`
);
