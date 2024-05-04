import { ICanonical } from "../canonical/base";

export type CanonicalFieldName = string;
export type CanonicalType = string;
export type NativeValue = unknown;

export function isValueObject(value: unknown): IValueObject | undefined {
    const clazz = (value as object).constructor as unknown as IValueClass<unknown>;
    return clazz.DEF ? value as IValueObject : undefined;
}

export function getValueObjectDef<T>(value: IValueObject): IValueDef<T> {
    const clazz = (value as object).constructor as unknown as IValueClass<T>;
    return clazz.DEF;
}

/**
 * Represents a class with a static DEF field which contains the value definition.
 */
export interface IValueClass<TNative> {
    DEF: IValueDef<TNative>;
}

export type NativePrimitive = undefined | boolean | number | string | Uint8Array | Date;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IValueObject {
}

export interface IValueDef<TNative> {
    /**
     * Create a new value object from value.
     * @param value A canonical value
     */
    construct(value: ICanonical | TNative): IValueObject;
    /**
     * Returns a potentially new value object from value. When value is a value object 
     * compatible with this definition, from may directly return the value.
     * @param value A canonical value or value object
     */
    from(value: ICanonical | TNative | IValueObject): IValueObject;

    hasType(type: CanonicalType): boolean;
}

