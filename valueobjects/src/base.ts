import { CanonicalLike, CanonicalLogicalTypes } from '@darlean/canonical';
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
    value?: unknown;
    canonical?: CanonicalLike;
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
        const types = Reflect.getOwnMetadata(LOGICAL_TYPES, this.prototype) as CanonicalLogicalTypes;
        if (!types) {
            throw new Error(`No logical types defined for class '${this.name}', possibly due to a missing class decorator.`);
        }
        return types;
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
