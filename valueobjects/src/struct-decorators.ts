import { StructValidator, UnknownFieldAction, ensureStructDefForConstructor } from './struct-valueobject';

export function structvalidation(validator: StructValidator, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureStructDefForConstructor(constructor).withValidator(validator, description);
    };
}

/**
 * Obgligatory decorator for TS struct values.
 *
 * @example
 * Defining a struct value with a required, optional and derived field:
 * ```
 *   @structvalue() class Person extends StructValue {
 *     get firstName() { return FirstName.required(); }                              // Required field
 *     get lastName() { return LastName.optional(); }                                // Optional field
 *     get fullName() { return this.firstName.value + ' ' + this.lastName?.value}    // Derived/calculated field
 *   }
 * ```
 */
export function structvalue(options?: { type?: string; extensions: UnknownFieldAction }) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureStructDefForConstructor(constructor, options?.type, options?.extensions);
    };
}
