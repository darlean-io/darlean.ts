import { ICanonical, ICanonicalSource } from '@darlean/canonical';

export type CanonicalFieldName = string;
export type CanonicalType = string;
export type NativeValue = unknown;

/**
 * Constant that indicates that a class must be structurally typed (instead of nominally typed
 * (aka duck-typed) as used by javascript.
 * Without structurally typing, the TS compiler will not warm you when assign a value object
 * of one type (say 'first-name') to a value that expects another type (say 'last-name'), both of type string.
 *
 * @example
 * ```
 * @stringvalue class FirstName extends StringValue { first_name = discriminative }
 * @stringvalue class LastName extends StringValue { last_name = discriminative }
 * let a: FirstName = FirstName.from('Alice);
 * a = LastName.from('Jansen');   // ==> Will not compile
 * ```
 */
export type discriminative = undefined;

export type NativePrimitive = undefined | boolean | number | string | Buffer | Date;
export type NativeStruct = { [key: string]: NativeType } | Map<string, NativeType> | object;
export type NativeArray = NativeType[];
export type TypedNativeArray<T extends NativeType> = T[];
export type NativeType = NativePrimitive | NativeStruct | NativeArray | ICanonical | IValueObject;

/**
 * Represents the type of contained values in compound structures (like arrays and structs) after creation.
 */
export type ValueType<T extends IValueObject = IValueObject> = ICanonical<T> | T;

export function isValueObject(value: unknown): IValueObject | undefined {
    if (value === undefined) {
        return undefined;
    }
    const clazz = (value as object).constructor as unknown as IValueClass<NativeType, IValueObject>;
    return clazz.DEF ? (value as IValueObject) : undefined;
}

export function getValueObjectDef<N extends NativeType, T extends IValueObject>(value: IValueObject): IValueDef<N, T> {
    const clazz = (value as object).constructor as unknown as IValueClass<N, T>;
    return clazz.DEF;
}

/**
 * Represents a class with a static DEF field which contains the value definition.
 */
export interface IValueClass<TNative extends NativeType, T extends IValueObject> {
    DEF: IValueDef<TNative, T>;
}

/**
 * Represents a supported native type, value object class, or function that returns one of the two.
 */
export type ValueDefLike<N extends NativeType, T extends IValueObject = IValueObject> =
    | IValueDef<N, T>
    | IValueClass<N, T>
    | (() => IValueDef<N, T> | IValueClass<N, T>);

export function extractValueDef<N extends NativeType, T extends IValueObject>(value: ValueDefLike<N, T>): IValueDef<N, T> {
    const defLike = typeof value === 'function' && !value.prototype ? value() : value;
    return (defLike as IValueClass<N, T>)?.DEF ?? defLike;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IValueObject {
    equals(other: IValueObject | undefined): boolean;
}

export abstract class ValueObject {
    private ___value_object: undefined;
    private ___canonical?: ICanonical<typeof this>;

    constructor(canonical?: ICanonical) {
        this.___canonical = canonical;
    }

    public get _definition(): IValueDef<NativeType, this> {
        return (Object.getPrototypeOf(this).constructor as IValueClass<NativeType, this>).DEF;
    }

    public equals(other: this | undefined): boolean {
        if (other === undefined) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other as ICanonicalSource<unknown>);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        if (this.___canonical) {
            return this.___canonical;
        }
        this.___canonical = this._deriveCanonicalRepresentation();
        return this.___canonical;
    }

    protected abstract _deriveCanonicalRepresentation(): ICanonical;
}

export interface IValueDef<TNative, T extends IValueObject = IValueObject> {
    /**
     * Create a new value object from value. If value is a struct, the field
     * names must already be canonicalized. That also counts for field names
     * of nested values.
     * @param value A canonical value
     */
    construct(value: ICanonical | TNative): T;

    /**
     * Returns a potentially new value object from value. When value is a value object
     * compatible with this definition, from may directly return the value.
     * If the value object is a struct, the field names must be in the native casing
     * (they are internally converted to the corresponding canonical field name).
     * When the field names are already canonicalized, consider using `construct`.
     * @param value A canonical value or value object
     */
    from(value: ICanonical | TNative | IValueObject): T;

    hasType(type: CanonicalType): boolean;

    get types(): CanonicalType[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    get template(): Function;
}

export function deriveTypeName(name: string) {
    // TODO: Optimize
    let result = '';
    for (const char of name) {
        if (char >= 'A' && char <= 'Z') {
            if (result != '') {
                result += '-';
            }
            result += char.toLowerCase();
        } else if (char === '_') {
            result += '-';
        } else if (char >= '0' && char <= '9') {
            result += char;
        } else if (char >= 'a' && char <= 'z') {
            result += char;
        } else {
            throw new Error(`Invalid character "${char}" in name: ${name}`);
        }
    }
    return result;
}
