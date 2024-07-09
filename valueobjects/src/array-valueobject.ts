import { ArrayCanonical, ICanonical, ICanonicalSource, isCanonical } from '@darlean/canonical';
import {
    IValueDef,
    IValueObject,
    CanonicalType,
    getValueObjectDef,
    isValueObject,
    IValueClass,
    deriveTypeName,
    NativeArray,
    ValueDefLike,
    NativeType,
    extractValueDef,
    ValueType,
    TypedNativeArray,
    ValueObject
} from './valueobject';
import { PrimitiveValue } from './primitive-valueobject';
import { StructValue } from './struct-valueobject';

export interface IArrayValueClass<TNative extends NativeType, T extends IValueObject = IValueObject> {
    DEF: ArrayDef<TNative, T>;
}

export type ArrayValidator = (values: (IValueObject | ICanonical)[]) => string | boolean | void | undefined;
export type TypedArrayValidator<T extends IValueObject> = (values: T[]) => string | boolean | void | undefined;

export class ArrayDef<TNative extends NativeType, T extends IValueObject = IValueObject> implements IValueDef<NativeArray, T> {
    private _types: CanonicalType[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;
    private _elementTypeDef?: ValueDefLike<TNative, T>;
    private _validators: { validator: ArrayValidator; description?: string }[];

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type?: CanonicalType, elementTypeDef?: ValueDefLike<TNative, T>) {
        this._template = template;
        this._types = [type ?? deriveTypeName(template.name)];
        this._validators = [];

        this._elementTypeDef = elementTypeDef;

        const proto = Object.getPrototypeOf(template);
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

    public get elementTypeDef() {
        return this._elementTypeDef;
    }

    public withBase(base: IArrayValueClass<TNative> | ArrayDef<TNative, T>): ArrayDef<TNative, T> {
        const base2 = base instanceof ArrayDef ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._types = [...base2.types, ...this._types];
        //this._validators = [...base2._validators, ...this._validators];
        return this;
    }

    public withValidator(validator: ArrayValidator, description?: string): ArrayDef<TNative, T> {
        this._validators.push({ validator, description });
        return this;
    }

    get template() {
        return this._template;
    }

    public construct(value: ICanonical | NativeArray): T {
        return Reflect.construct(this._template, [value, isCanonical(value) ? value : undefined]);
    }

    public hasType(type: CanonicalType) {
        return this._types.includes(type);
    }

    public from(value: ICanonical | NativeArray): T {
        const vo = isValueObject(value);
        if (vo) {
            const ourType = this._types.at(-1);
            const voDef = getValueObjectDef(vo);
            if (ourType && voDef.hasType(ourType)) {
                return vo as T;
            } else if (ourType) {
                throw new Error(`Value object is not compatible with ${ourType}`);
            }
        }
        return this.construct(value);
    }
}

//type ArrayValueClassType<N extends NativeType, V extends ValueType> = typeof ArrayValue<N, V>;
//type NativeTypeOf<T> = T extends typeof ArrayValue<infer N extends NativeType, any> ? N : never;
//type ValueTypeOf<T extends ArrayValueClassType<N2, V2>, N2 extends NativeType, V2 extends ValueType> = T extends ArrayValueClassType<N2, infer V> ? V : never;

type NativeValueOf<T> = T extends PrimitiveValue<infer TNative> ? TNative : T extends StructValue ? Partial<T> : never;

type ValueValueOf<T> = T extends ValueObject ? T : never;

// Arrayvalue does not have TNative extends NativeType as generic part, because most generic info on subclasses is not kept by TS.
// It's no big deal anyway, just use the ObjectValue.from for every object in an array.
// See: https://github.com/microsoft/TypeScript/issues/39851

/**
 * Value object that represents a list of items. Items are either value objects of TElem (when the array value is typed, or when a user explicitly
 * includes value objects during creation) or ICanonical instances.
 */
export class ArrayValue<TElem extends ValueType | never>
    extends ValueObject
    implements IValueObject, ICanonicalSource<typeof this>
{
    static DEF = array(ArrayValue, '');

    private _items?: TElem[];

    static required<TElem extends ValueType, T extends typeof ArrayValue<TElem>>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<TElem extends ValueType, T extends typeof ArrayValue<TElem>>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Returns a new array value from the contents of value.
     * @param value The contents of the new array value. It can be an array canonical or a native array of canonical or value objects
     * or native values of the proper type.
     * @returns The newly created array value.
     */
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, value: NativeValueOf<TElem2>[]): InstanceType<T>;
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, value: ValueValueOf<TElem2>[]): InstanceType<T>;
    static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>>(this: T, value: InstanceType<T>): InstanceType<T>;

    /**
     * Returns a new array value containing the contents of value repeated multiple times.
     * @param value The contents of the new array value. It can be an array canonical or a native array of canonical or value objects or native
     * values of the proper type.
     * @param repeat Repeat count that indicates how often value is repeated.
     * @returns The newly created array value.
     */
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, value: NativeValueOf<TElem2>[], repeat: number): InstanceType<T>;
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, value: ValueValueOf<TElem2>[], repeat: number): InstanceType<T>;
    static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>>(
        this: T,
        value: InstanceType<T>,
        repeat: number
    ): InstanceType<T>;

    /**
     * Returns a new array value containing the concatenated contents of multiple arrays.
     * @param arrays The arrays that are to be concatenated. They can be an array canonical or a native array of canonical or value objects or native
     * values of the proper type.
     * @returns The newly created array value.
     */
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, ...values: NativeValueOf<TElem2>[][]): InstanceType<T>;
    static from<
        TElem extends IValueObject,
        T extends typeof ArrayValue<TElem>,
        TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never
    >(this: T, ...values: ValueValueOf<TElem2>[][]): InstanceType<T>;
    static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>>(
        this: T,
        ...values: InstanceType<T>[]
    ): InstanceType<T>;

    //static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>, TElem2 = T extends typeof ArrayValue<infer Q extends IValueObject> ? Q : never>
    //  (this: T, ...values: NativeValueOf<TElem2>[][] ): InstanceType<T>;
    //static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>>
    //  (this: T, ...values: TElem[][] ): InstanceType<T>;
    //static from<TElem extends ValueType, T extends typeof ArrayValue<TElem>>
    //  (this: T, ...values: TElem[][] ): InstanceType<T>;

    static from<U extends ValueType, T extends typeof ArrayValue<U>>(
        this: T,
        value: ArrayValue<ValueType> | U[],
        ...rest: (number | ArrayValue<ValueType> | U[])[]
    ): InstanceType<T> {
        if (rest.length === 0 || rest[0] === 1) {
            return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(value) as InstanceType<T>;
        }

        if (typeof rest[0] === 'number') {
            const get = Array.isArray(value) ? (idx: number) => value[idx] : (idx: number) => value.get(idx);
            const repeat = rest[0];
            const temp = new Array(value.length * repeat);
            const len = value.length;
            for (let i = 0; i < repeat; i++) {
                for (let j = 0; j < value.length; j++) {
                    temp[i * len + j] = get(j);
                }
            }
            return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(temp) as InstanceType<T>;
        }

        const subarrays = [toNativeArray(value)];
        for (const restItem of rest as (ArrayValue<ValueType> | U[])[]) {
            subarrays.push(toNativeArray(restItem));
        }

        const joined = subarrays.flat(1);
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(joined) as InstanceType<T>;
    }

    /**
     * Creates a new array value by mapping the values from another array value or from a native array.
     * @param input The input array, which can be a native array of an array value.
     * @param func The function that maps input values to values supported by the array value class.
     * @returns A new mapped array value.
     */

    static mapFrom<U extends ValueType, T extends typeof ArrayValue<U>, TInput extends unknown[]>(
        this: T,
        input: TInput,
        func: (x: TInput[number], idx: number, array: TInput) => U
    ): InstanceType<T>;

    static mapFrom<
        U extends ValueType,
        T extends typeof ArrayValue<U>,
        TInput extends ArrayValue<ValueType>,
        TElem = TInput extends ArrayValue<infer TElem> ? TElem : never
    >(this: T, input: TInput, func: (x: TElem, idx: number, array: TInput) => U): InstanceType<T>;

    static mapFrom<
        U extends ValueType,
        T extends typeof ArrayValue<U>,
        ValueTypeInput extends ValueType,
        NativeTypeInput extends NativeType,
        TInput extends ArrayValue<ValueTypeInput> | NativeTypeInput[],
        X = TInput extends ArrayValue<infer ValueTypeInput> ? ValueTypeInput : TInput extends Array<infer Z> ? Z : never
    >(this: T, input: TInput, func: (x: X, idx: number, array: TInput) => U): InstanceType<T> {
        const get = Array.isArray(input) ? (idx: number) => input[idx] : (idx: number) => input.get(idx);
        const results: (IValueObject | U)[] = new Array(input.length);
        for (let idx = 0; idx < input.length; idx++) {
            const item = get(idx) as X;
            results[idx] = func(item, idx, input);
        }

        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(results) as InstanceType<T>;
    }

    /**
     * Creates a new array value by filtering the values from another array value or from a native array.
     * @param input The input array, which can be a native array of an array value.
     * @param func The function that returns true for values that must be included in the resulting array value.
     * @returns A new mapped array value.
     */
    static filterFrom<U extends ValueType, T extends typeof ArrayValue<U>>(
        this: T,
        input: ArrayValue<U> | U[],
        func: (x: U) => boolean
    ): InstanceType<T> {
        const get = Array.isArray(input) ? (idx: number) => input[idx] : (idx: number) => input.get(idx);
        const results: U[] = [];
        for (let idx = 0; idx < input.length; idx++) {
            const item = get(idx);
            if (func(item)) {
                results.push(item);
            }
        }

        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(results) as InstanceType<T>;
    }

    /**
     * Creates a new array value by slicing the values from another array value or from a native array.
     * @param input The input array, which can be a native array of an array value.
     * @param start The start index (inclusive). Default is 0. When negative, it indicates the offset from the end (-1 corresponds to the last element).
     * @param end The end index (exclusive). Default is input.length. When negative, it indicates the offset from the end (-1 corresponds to the last element).
     * @returns A new mapped array value.
     */
    static sliceFrom<U extends ValueType, T extends typeof ArrayValue<U>>(
        this: T,
        input: ArrayValue<U> | U[],
        start?: number,
        end?: number
    ): InstanceType<T> {
        const sliced = input.slice(start, end);
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(sliced) as InstanceType<T>;
    }

    /**
     * Creates a new array value by sorting the values from another array value or from a native array.
     * @param input The input array, which can be a native array of an array value.
     * @param func The function that returns a negative value when a should come before b, and vice versa.
     * @returns A new sorted array value.
     */
    static sortFrom<U extends ValueType, T extends typeof ArrayValue<U>>(
        this: T,
        input: ArrayValue<U> | U[],
        func: ((a: U, b: U) => number) | undefined
    ): InstanceType<T> {
        const results: U[] = toNativeArray(input);
        results.sort(func);
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(results) as InstanceType<T>;
    }

    /**
     * Creates a new array value by reverting the values from another array value or from a native array.
     * @param input The input array, which can be a native array of an array value.
     * @returns A new reverted array value.
     */
    static reverseFrom<U extends ValueType, T extends typeof ArrayValue<U>>(
        this: T,
        input: ArrayValue<U> | U[]
    ): InstanceType<T> {
        const results: U[] = toNativeArray(input);
        results.reverse();
        return (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF.from(results) as InstanceType<T>;
    }

    constructor(value: ICanonical | TypedNativeArray<TElem>, canonical: ICanonical | undefined) {
        super(canonical);
        const proto = this.constructor as unknown as IArrayValueClass<TElem>;
        this._items = validateArray<TElem>(proto.DEF, value);
    }

    get length() {
        return this._checkItems().length;
    }

    public get(idx: number) {
        return this._checkItems()[idx];
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const items = this._checkItems();
        return ArrayCanonical.from(
            items as unknown as ICanonical[],
            (Object.getPrototypeOf(this).constructor as IArrayValueClass<NativeType>).DEF.types
        );
    }

    public extractItems(): (ICanonical | IValueObject)[] {
        const items = this._checkItems();
        this._items = undefined;
        return items;
    }

    /**
     * Maps all items to arbitrary other values by means of a mapping function.
     * @param func Function that maps an input value to an output value
     * @returns A native array (not a value object) of mapped items
     */
    public map<TResult>(func: (x: TElem, idx: number, array: this) => TResult): TResult[] {
        const results: TResult[] = new Array(this.length);
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx);
            results[idx] = func(item, idx, this);
        }
        return results;
    }

    /**
     * Returns a native array with filtered items from this array value.
     * @param func The function that returns true for values that must be included in the resulting array value.
     * @returns A new mapped array value.
     */
    public filter(func: (x: TElem) => boolean): TElem[] {
        const results: TElem[] = [];
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx);
            if (func(item)) {
                results.push(item);
            }
        }

        return results;
    }

    /**
     * Returns an item based on a match function.
     * @param func The function that returns true for the value that must be found.
     * @returns The found value or undefined.
     */
    public find(func: (x: TElem) => boolean): TElem | undefined {
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx);
            if (func(item)) {
                return item;
            }
        }
    }

    /**
     * Returns the index of an item based on a match function.
     * @param func The function that returns true for the value that must be found.
     * @returns The index of the found value or -1.
     */
    public findIndex(func: (x: TElem) => boolean): number {
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx);
            if (func(item)) {
                return idx;
            }
        }
        return -1;
    }

    /**
     * Returns a native array with reverted items from this array value.
     * @returns A new mapped array value.
     */
    public reverse(): TElem[] {
        const len = this.length;
        const results: TElem[] = new Array(len);
        for (let idx = 0; idx < len; idx++) {
            results[len - idx - 1] = this.get(idx);
        }

        return results;
    }

    /**
     * Returns a native array with sliced items from this array value.
     * @param start The start index (inclusive). Default is 0. When negative, it indicates the offset from the end (-1 corresponds to the last element).
     * @param end The end index (exclusive). Default is input.length. When negative, it indicates the offset from the end (-1 corresponds to the last element).
     * @returns A new sliced array value.
     */
    public slice(start?: number, end?: number): TElem[] {
        return this._checkItems().slice(start, end);
    }

    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    public reduce(callbackfn: (previousValue: TElem, currentValue: TElem, currentIndex: number, array: TElem[]) => TElem): TElem;
    public reduce(
        callbackfn: (previousValue: TElem, currentValue: TElem, currentIndex: number, array: TElem[]) => TElem,
        initialValue: TElem
    ): TElem;

    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    public reduce<U>(
        callbackfn: (previousValue: U, currentValue: TElem, currentIndex: number, array: TElem[]) => U,
        initialValue: U
    ): U;

    public reduce<U = TElem>(
        callbackfn: (previousValue: TElem, currentValue: TElem, currentIndex: number, array: TElem[]) => U,
        ...initialValue: U[]
    ): U {
        if (initialValue.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return this._checkItems().reduce(callbackfn as any) as unknown as U;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._checkItems().reduce<U>(callbackfn as any, initialValue[0] as any);
    }

    *[Symbol.iterator]() {
        const len = this._checkItems().length;
        for (let idx = 0; idx < len; idx++) {
            yield this._checkItems()[idx];
        }
    }

    private _checkItems(): TElem[] {
        if (this._items === undefined) {
            throw new Error(`Not allowed to access unfrozen array`);
        }
        return this._items;
    }
}

export type TypedArrayValue<TElem extends ValueType> = ArrayValue<TElem>;
// TODO: Is "never" ok?
export type UntypedArrayValue = ArrayValue<never>;

function validateArray<TElem extends ValueType>(def: ArrayDef<TElem>, input: ICanonical | TypedNativeArray<TElem>): TElem[] {
    const items: TElem[] = [];

    function addValue(value: TElem) {
        if (def.elementTypeDef) {
            const extractedDef = extractValueDef(def.elementTypeDef);
            const instance = extractedDef.from(value);
            items.push(instance as TElem); // Assume that when user provides a TElem, it is also a typed array and
            // the user does not put anything else into the array.
        } else {
            if (!(value as unknown as ICanonicalSource<unknown>)._peekCanonicalRepresentation) {
                throw new Error(
                    `Invalid contents for untyped array of type "${def.types.at(
                        -1
                    )}": Value of type "${typeof value}" is not a canonical, canonical source or value object`
                );
            }
            items.push(value);
        }
    }

    if ((input as ICanonical).firstSequenceItem) {
        let item = (input as ICanonical).firstSequenceItem;
        while (item) {
            const value = item.value;
            addValue(value as TElem);
            item = item.next();
        }
    } else {
        for (const value of input as TypedNativeArray<TElem>) {
            addValue(value);
        }
    }

    for (const validator of def.validators) {
        let result: string | boolean | undefined | void;
        try {
            result = validator.validator(items);
        } catch (e) {
            result = (e as Error).message ?? false;
        }

        if (result === true || result === '' || result === undefined) {
            continue;
        }
        if (typeof result === 'string') {
            throw new Error(`Invalid contents for array of type "${def.types.at(-1)}": ${result}`);
        } else if (validator.description) {
            throw new Error(`Invalid contents for array of type "${def.types.at(-1)}": ${validator.description}`);
        }
        throw new Error(`Invalid contents for array of type "${def.types.at(-1)}"`);
    }

    return items;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function array<TNative extends NativeType>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    template: Function,
    type?: CanonicalType,
    elementTypeDef?: ValueDefLike<TNative>
): ArrayDef<TNative> {
    const def = new ArrayDef(template, type, elementTypeDef);
    (template as unknown as IArrayValueClass<TNative>).DEF = def;
    return def;
}

export const arrayv = array;

function toNativeArray<TElem extends ValueType>(input: ArrayValue<TElem> | TElem[]): TElem[] {
    const results: TElem[] = new Array(input.length);
    if (Array.isArray(input)) {
        for (let idx = 0; idx < input.length; idx++) {
            const item = input[idx];
            results[idx] = item;
        }
    } else {
        for (let idx = 0; idx < input.length; idx++) {
            const item = input.get(idx);
            results[idx] = item;
        }
    }

    return results;
}
