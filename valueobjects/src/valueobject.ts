export type CanonicalFieldName = string;
export type CanonicalType = string;
//type NativeValue = unknown;

export class ValidationError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Class<T> = { new (...args: any[]): T; name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// https://stackoverflow.com/questions/66599065/typescript-abstract-static-factory-with-protected-constructor
// type ClassDefinitionFor<T> = { prototype: T };

//type ValueClass<TValue = Value> = Class<TValue>;

// type InstanceOfClass<T> = T extends { prototype: infer R } ? R : never;

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

//type NativePrimitive = undefined | boolean | number | string | Buffer | Date;
//type NativeStruct = { [key: string]: NativeType } | Map<string, NativeType> | object;
//type NativeArray = NativeType[];
//type NativeType = NativePrimitive | NativeStruct | NativeArray | ICanonical | Value;

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
