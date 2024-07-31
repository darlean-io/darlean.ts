import { CanonicalLike, ICanonical, ICanonicalSource, isCanonicalLike, toCanonical } from '@darlean/canonical';

export type CanonicalFieldName = string;
export type CanonicalType = string;
export type NativeValue = unknown;

export class ValidationError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Class<T> = { new (...args: any[]): T; name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// https://stackoverflow.com/questions/66599065/typescript-abstract-static-factory-with-protected-constructor
export type ClassDefinitionFor<T> = { prototype: T };
export type ValueClass<TValue = Value> = Class<TValue>;
export type InstanceOfClass<T> = T extends { prototype: infer R } ? R : never;

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
export type NativeType = NativePrimitive | NativeStruct | NativeArray | ICanonical | Value;

export type ConstructInput =
    | undefined
    | boolean
    | number
    | string
    | Buffer
    | Date
    | Map<string, ICanonical | Value>
    | (ICanonical | Value)[];

export type NativeValueFor<T extends Value> = T extends Value<infer TNative> ? TNative : never;
export type FromValueFor<T extends Value<TFrom>, TFrom = T extends Value<infer X> ? X : never> = TFrom;

/**
 * Represents the type of contained values in compound structures (like arrays and structs) after creation.
 */
export type ValueType<T extends Value = Value> = CanonicalLike<T>;

export function isValueOrUndef(value: unknown): Value | undefined {
    return value instanceof Value ? value : undefined;
}

export type ValueOrValueClass<TValue = Value> = TValue | ValueClass<TValue>;

/**
 * Represents a value object class, or function that returns one of the two.
 */
export type ValueDefLike<TValue extends ValueOrValueClass = Value> = TValue | (() => TValue);

export type ValueClassLike<TValue extends Value> = ValueClass<TValue> | (() => ValueClass<TValue>);

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IValueObject<TNative = unknown, TFrom = TNative> {
    equals(other: IValueObject | undefined): boolean;
    get _def(): IValueDef<ValueClass, TNative, TFrom>;
}

export abstract class Value<TFrom = unknown> implements IValueObject, ICanonicalSource {
    private ___value: discriminative;

    abstract get _def(): IValueDef<ValueClass, TFrom>;

    abstract _peekCanonicalRepresentation(): ICanonical<this>;
    abstract equals(other: IValueObject | undefined): boolean;
}

/**
 * BaseValueObject can be used as case class for derived value objects. For the convenience of derviced classes,
 * it already provides a mechanism to ensure that the canonical value is only calculated once and for
 * comparison (equals).
 */
export abstract class BaseValueObject<TFrom = unknown> extends Value<TFrom> {
    private ___value_object: discriminative;
    private ___canonical?: CanonicalLike<typeof this>;
    private ___def: IValueDef<ValueClass, TFrom>;

    protected constructor(def: IValueDef<ValueClass, TFrom>, canonical: CanonicalLike | undefined) {
        super();
        this.___def = def;
        this.___canonical = canonical;
    }

    get _def() {
        return this.___def;
    }

    public equals(other: unknown): boolean {
        if (!isCanonicalLike(other)) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other);
    }

    public is(base: Value) {
        return this._def.is(base._def);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        if (this.___canonical) {
            return toCanonical(this.___canonical);
        }
        this.___canonical = this._deriveCanonicalRepresentation();
        return this.___canonical;
    }

    protected abstract _deriveCanonicalRepresentation(): ICanonical;
}

export interface IValueDef<TValueClass extends ValueClass = ValueClass, TNative = unknown, TFrom = TNative> {
    /**
     * Returns a potentially new TValue instance with the data from the provided canonical-like.
     * The canonical-like is validated. When validation is unsuccessful, an error is thrown and no new instance
     * is created.
     * The provided value does not have to be a canonical; it can be any object that implements
     * ICanonicalSource<TValue>. In particular, the provided value can already be an instancee
     * of type TValue. In that case, it is simply returned.
     */
    fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass>;

    hasType(type: CanonicalType): boolean;

    // validate<TInput, TOutput>(value: TInput): TOutput;

    //construct(canonical: ICanonical | undefined, value: TConstructInput | undefined): InstanceType<TValueClass>;

    get types(): CanonicalType[];

    is(base: IValueDef<ValueClass, unknown, unknown>): boolean;

    from(input: TFrom | ICanonical | Value): InstanceType<TValueClass>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    //get template(): Function;
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
