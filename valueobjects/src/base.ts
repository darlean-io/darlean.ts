import { CanonicalLike, CanonicalLogicalTypes, ICanonical } from '@darlean/canonical';
import { CanonicalFieldName, deriveTypeName } from './valueobject';

export const VALIDATORS = 'validators';
export const LOGICAL_TYPES = 'logical=types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Class<T> = { new (...args: any[]): T; name: string };

export type ValidatorFunc<T = unknown> = (value: T, fail: (msg: string) => void) => void;
//export type ValidatorFunc<T = unknown> = (value: T) => string | boolean | void;

export function required<T>(clazz: Class<T>): T {
    return { required: true, clazz: clazz } as unknown as T;
}

export function optional<T>(clazz: Class<T>): T | undefined {
    return { required: false, clazz: clazz } as unknown as T;
}

export type MethodKeys<T> = {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export function valueobject(logicalType?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        const name = logicalType === undefined ? deriveTypeName(constructor.name) : logicalType;
        let types = Reflect.getOwnMetadata(LOGICAL_TYPES, constructor.prototype);
        if (!types) {
            if (name === '') {
                types = [...((Reflect.getMetadata(LOGICAL_TYPES, constructor.prototype) as string[] | undefined) ?? [])];
            } else {
                types = [...((Reflect.getMetadata(LOGICAL_TYPES, constructor.prototype) as string[] | undefined) ?? []), name];
            }
            Reflect.defineMetadata(LOGICAL_TYPES, types, constructor.prototype);
        } else {
            if (name !== '') {
                types.push(name);
            }
        }
    };
}

export function validation<T>(validator: (value: T) => string | boolean | void, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        const validatorFunc: ValidatorFunc<T> = (value, fail) => {
            try {
                const result = validator(value);
                if (typeof result === 'string') {
                    return fail(result);
                }
                if (result === false) {
                    return fail(description ?? '');
                }
            } catch (e) {
                return fail((e as Error).toString());
            }
        };
        let validators = Reflect.getOwnMetadata(VALIDATORS, constructor.prototype);
        if (!validators) {
            validators = [
                ...((Reflect.getMetadata(VALIDATORS, constructor.prototype) as ValidatorFunc[] | undefined) ?? []),
                validatorFunc
            ];
            Reflect.defineMetadata(VALIDATORS, validators, constructor.prototype);
        } else {
            validators.push(validatorFunc);
        }
    };
}

export interface IValueOptions {
    cacheCanonical?: boolean;
    value?: unknown;
    canonical?: CanonicalLike;
}

export interface IFromCanonicalOptions {
    cacheCanonical?: boolean;
}

export class Value {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_options: IValueOptions) {}
    public get _logicalTypes(): CanonicalLogicalTypes {
        throw new Error('Not implemented');
    }

    public equals(_other: unknown): boolean {
        throw new Error('Not implemented');
    }

    static get logicalTypes(): CanonicalLogicalTypes {
        return checkLogicalTypes(this.prototype);
    }
}

export function constructValue<T>(clazz: Class<T>, options: IValueOptions) {
    return Reflect.construct(clazz, [options]);
}

export type ValueClass<TValue extends Value = Value> = Class<TValue> & {
    get logicalTypes(): CanonicalLogicalTypes;
};

export type ValueClassLike<TValue extends Value = Value> = ValueClass<TValue> | (() => ValueClass<TValue>);

export function toValueClass<
    T extends ValueClassLike<TValue>,
    TValue extends Value = T extends ValueClassLike<infer X> ? X : never
>(v: T): ValueClass<TValue> {
    // eslint-disable-next-line @typescript-eslint/ban-types
    if ((v as Function).prototype) {
        return v as ValueClass<TValue>;
    }
    return (v as () => ValueClass<TValue>)();
}

export function aExtendsB(a: CanonicalFieldName[], b: CanonicalFieldName[]) {
    for (let idx = 0; idx < b.length; idx++) {
        if (a[idx] !== b[idx]) {
            return false;
        }
    }
    return true;
}

export function shouldCacheCanonical(
    canonical: ICanonical,
    expectedTypes: CanonicalLogicalTypes,
    cacheCanonical: boolean | undefined
) {
    // Caching of canonicals is the mechanism in which a value object stores the canonical it is created from, so that when a canonical is
    // requested later on, this stored (cached) value can be returned. This has 2 reasons:
    // 1. Efficiency / performance
    // 2. To preserve the fields in the canonical that are not part of the value.
    // Caching should NOT be used when the canonical is incomplete. Like for a flex canonical that does not know the proper logical types
    // nor the actual physical type.
    // We detect this situation by using 'aExtendsB', which compares the logical types. When a canonical does not extend the expected type, we
    // should never cache it.
    // Note: The "canonical.is" can not be used here because it purposely will return true for such flex canonicals, even though it does not contain a logical type.
    return cacheCanonical === undefined ? aExtendsB(canonical.logicalTypes, expectedTypes) : cacheCanonical;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function checkLogicalTypes(proto: Object) {
    const types = Reflect.getOwnMetadata(LOGICAL_TYPES, proto) as CanonicalLogicalTypes;
    if (!types) {
        throw new Error(
            `No logical types defined for class '${proto.constructor.name}', possibly due to a missing class decorator.`
        );
    }
    return types;
}
