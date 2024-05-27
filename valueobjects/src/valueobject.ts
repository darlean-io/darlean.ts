import { ICanonical } from '@darlean/canonical';

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
export type NativeStruct = { [key: string]: ICanonical | IValueObject } | Map<string, ICanonical | IValueObject> | object;
export type NativeArray = (ICanonical | IValueObject)[];
export type NativeType = NativePrimitive | NativeStruct | NativeArray;

export function isValueObject(value: unknown): IValueObject | undefined {
    if (value === undefined) {
        return false;
    }
    const clazz = (value as object).constructor as unknown as IValueClass<any>;
    return clazz.DEF ? (value as IValueObject) : undefined;
}

export function getValueObjectDef<T extends NativeType>(value: IValueObject): IValueDef<T> {
    const clazz = (value as object).constructor as unknown as IValueClass<T>;
    return clazz.DEF;
}

/**
 * Represents a class with a static DEF field which contains the value definition.
 */
export interface IValueClass<TNative extends NativeType> {
    DEF: IValueDef<TNative>;
}

/**
 * Represents a supported native type, value object class, or function that returns one of the two.
 */
export type ValueDefLike<TNative extends NativeType> =
    | IValueDef<TNative>
    | IValueClass<TNative>
    | (() => IValueDef<TNative> | IValueClass<TNative>);

export function extractValueDef<TNative extends NativeType>(value: ValueDefLike<TNative>): IValueDef<TNative> {
    let defLike = value;
    if (typeof value === 'function' && !value.prototype) {
        defLike = value();
    }
    return (defLike as IValueClass<any>)?.DEF ?? defLike;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IValueObject {}

export interface IValueDef<TNative> {
    /**
     * Create a new value object from value. If value is a struct, the field
     * names must already be canonicalized. That also counts for field names
     * of nested values.
     * @param value A canonical value
     */
    construct(value: ICanonical | TNative): IValueObject;

    /**
     * Returns a potentially new value object from value. When value is a value object
     * compatible with this definition, from may directly return the value.
     * If the value object is a struct, the field names must be in the native casing
     * (they are internally converted to the corresponding canonical field name).
     * When the field names are already canonicalized, consider using `construct`.
     * @param value A canonical value or value object
     */
    from(value: ICanonical | TNative | IValueObject): IValueObject;

    hasType(type: CanonicalType): boolean;

    get types(): string[];
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
