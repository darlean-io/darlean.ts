import {
    ArrayCanonical,
    CanonicalLike,
    equals,
    ICanonical,
    ICanonicalSource,
    isCanonicalLike,
    toCanonical
} from '@darlean/canonical';

import {
    aExtendsB,
    Class,
    constructValue,
    IValueOptions,
    LOGICAL_TYPES,
    toValueClass,
    validation,
    ValidatorFunc,
    VALIDATORS,
    Value,
    ValueClassLike,
    valueobject
} from './base';
import { ValidationError } from './valueobject';
import { NoInfer } from './utils';

const ELEM_CLASS = 'elem-class';

type SequenceArray<TElem extends Value> = TElem[];

export class SequenceValue<TElem extends Value & ICanonicalSource> extends Value implements ICanonicalSource {
    private _items?: TElem[];
    private _canonical?: ICanonical;

    static required<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>): NoInfer<T> {
        return { required: true, clazz: this } as unknown as NoInfer<T>;
    }

    static optional<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>): NoInfer<T> {
        return { required: false, clazz: this } as unknown as NoInfer<T>;
    }

    /**
     * Creates a new sequence value from an array of values.
     */
    public static from<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, value: NoInfer<TElem2>[]): T {
        const options: IValueOptions = { value };
        return constructValue(this, options);
    }

    public static fromCanonical<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, value: ICanonical) {
        const options: IValueOptions = { canonical: value };
        return Reflect.construct(this, [options]);
    }

    /**
     * Creates a new sequence value by copying a template value multiple times.
     */
    public static fillFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, template: NoInfer<TElem2>, repeat: number): T {
        const items = new Array(repeat).fill(template);
        const options: IValueOptions = { value: items };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by concatenating multiple arrays.
     */
    public static concatenateFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, ...arrays: (NoInfer<TElem2>[] | SequenceValue<NoInfer<TElem2>>)[]): T {
        const items: NoInfer<TElem2>[] = [];
        for (const a of arrays) {
            if (Array.isArray(a)) {
                items.push(...a);
            } else if (a instanceof SequenceValue) {
                for (const item of a) {
                    items.push(item as NoInfer<TElem2>);
                }
            } else {
                throw new Error('Argument is not an array or SequenceValue');
            }
        }
        const options: IValueOptions = { value: items };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by mapping existing items.
     */
    public static mapFrom<
        T extends SequenceValue<TElem2>,
        TSource extends SequenceValue<TSourceElem> | TSourceElem[],
        TSourceElem extends Value & ICanonicalSource = TSource extends SequenceValue<infer X>
            ? X
            : TSource extends (infer Y)[]
            ? Y
            : never,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, source: TSource, mapFunc: (value: TSourceElem, idx: number, arr: TSource) => NoInfer<TElem2>): T {
        const results = [];
        let idx = 0;
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                results.push(mapFunc(value, idx, source));
                idx++;
            }
        } else {
            for (const value of source.values()) {
                results.push(mapFunc(value, idx, source));
                idx++;
            }
        }
        const options: IValueOptions = { value: results };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by sorting the input array.
     * The provided sort func receives values of the element-type for this sequence value.
     * To please typescript, you may need to cast them explicitly to this type via `(a: MyType, b: MyType)`.
     */
    public static sortFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(
        this: Class<T>,
        source: SequenceValue<NoInfer<TElem2>> | NoInfer<TElem2>[],
        sortFunc: (a: NoInfer<TElem2>, b: NoInfer<TElem2>) => number
    ): T {
        const temp: NoInfer<TElem2>[] = [];
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                temp.push(value as NoInfer<TElem2>);
            }
        } else {
            for (const value of source.values()) {
                temp.push(value);
            }
        }
        temp.sort(sortFunc);
        const options: IValueOptions = { value: temp };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by filtering the input array.
     * The provided sort func receives values of the element-type for this sequence value.
     * To please typescript, you may need to cast them explicitly to this type via `(value: MyType)`.
     */
    public static filterFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(
        this: Class<T>,
        source: SequenceValue<NoInfer<TElem2>> | NoInfer<TElem2>[],
        filterFunc: (value: NoInfer<TElem2>) => boolean
    ): T {
        const temp: NoInfer<TElem2>[] = [];
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                if (filterFunc(value as NoInfer<TElem2>)) {
                    temp.push(value as NoInfer<TElem2>);
                }
            }
        } else {
            for (const value of source.values()) {
                if (filterFunc(value)) {
                    temp.push(value);
                }
            }
        }
        const options: IValueOptions = { value: temp };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by slicing the input array.
     */
    public static sliceFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, source: SequenceValue<NoInfer<TElem2>> | NoInfer<TElem2>[], start?: number, end?: number): T {
        const temp: NoInfer<TElem2>[] = [];
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                temp.push(value as NoInfer<TElem2>);
            }
        } else {
            for (const value of source.values()) {
                temp.push(value);
            }
        }
        const options: IValueOptions = { value: temp.slice(start, end) };
        return constructValue(this, options);
    }

    /**
     * Creates a new sequence value by reversing the input array.
     */
    public static reverseFrom<
        T extends SequenceValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends SequenceValue<infer X> ? X : never
    >(this: Class<T>, source: SequenceValue<NoInfer<TElem2>> | NoInfer<TElem2>[]): T {
        const temp: NoInfer<TElem2>[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                temp.push(value as NoInfer<TElem2>);
            }
        } else {
            for (const value of source.values()) {
                temp.push(value);
            }
        }
        const options: IValueOptions = { value: temp.reverse() };
        return constructValue(this, options);
    }

    /**
     * Creates a new mapping value instance using the provided value.
     * @param value
     */
    constructor(options: IValueOptions) {
        super(options);

        let v: TElem[] = [];
        if (options.canonical) {
            this._canonical = toCanonical(options.canonical);
            const logicalTypes = Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this));
            const canonicalLogicalNames = this._canonical.logicalTypes;
            for (let idx = 0; idx < logicalTypes.length; idx++) {
                if (logicalTypes[idx] !== canonicalLogicalNames[idx]) {
                    throw new ValidationError(
                        `Incoming value of logical types '${canonicalLogicalNames.join(
                            '.'
                        )} is not compatible with '${logicalTypes.join('.')}`
                    );
                }
            }
            v = this._fromCanonical(this._canonical) as TElem[];
        } else {
            for (const elem of options.value as TElem[]) {
                v.push(elem);
            }
        }
        const msgs: string[] = [];
        const validated = this._validate(v, (msg: string) => msgs.push(msg)) as TElem[] | undefined;
        if (msgs.length > 0) {
            throw new ValidationError(msgs.join('; '));
        }
        this._items = validated ?? v;
    }

    public get(index: number): TElem | undefined {
        return this._checkItems()[index];
    }

    public values(): IterableIterator<TElem> {
        return this._checkItems().values();
    }

    public _peekCanonicalRepresentation(): ICanonical<this> {
        if (this._canonical) {
            return this._canonical;
        }
        this._canonical = this._toCanonical(this._checkItems(), this._logicalTypes);
        return this._canonical;
    }

    public get _logicalTypes() {
        return (Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this)) ?? []) as string[];
    }

    public equals(other: unknown): boolean {
        if (!isCanonicalLike(other)) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other);
    }

    public get length() {
        return this._checkItems().length;
    }

    *[Symbol.iterator]() {
        const len = this._checkItems().length;
        for (let idx = 0; idx < len; idx++) {
            yield this._checkItems()[idx];
        }
    }

    /**
     * Extracts the current elements. After that, the sequence value should not be
     * used anymore and throws errors when you try to access values.
     */
    public extractElements(): SequenceArray<TElem> {
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const item = this.get(idx)!;
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
            if (item && func(item)) {
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
            if (item && func(item)) {
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
            if (item && func(item)) {
                return idx;
            }
        }
        return -1;
    }

    /**
     * Returns the index of value, or -1 when not present. Values are compared using `canonical.equals`.
     */
    public indexOf(value: CanonicalLike): number {
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx) as CanonicalLike;
            if (item && equals(value, item)) {
                return idx;
            }
        }
        return -1;
    }

    /**
     * Returns whether value is present. Values are compared using `canonical.equals`.
     */
    public includes(value: CanonicalLike): boolean {
        for (let idx = 0; idx < this.length; idx++) {
            const item = this.get(idx) as CanonicalLike;
            if (item && equals(value, item)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a native array with reverted items from this array value.
     * @returns A new mapped array value.
     */
    public reverse(): TElem[] {
        const len = this.length;
        const results: TElem[] = new Array(len);
        for (let idx = 0; idx < len; idx++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            results[len - idx - 1] = this.get(idx)!;
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

    protected _fromCanonical(canonical: ICanonical) {
        const itemClazz = Reflect.getOwnMetadata(ELEM_CLASS, Object.getPrototypeOf(this)) as ValueClassLike;
        const result: (Value & ICanonicalSource)[] = [];
        let item = canonical.firstSequenceItem;
        while (item) {
            const itemCan = toCanonical(item.value);
            const value = constructValue(toValueClass(itemClazz as ValueClassLike<Value & ICanonicalSource>), {
                canonical: itemCan
            }) as Value & ICanonicalSource;
            result.push(value);
            item = item.next();
        }
        return result;
    }

    protected _toCanonical(value: (Value & ICanonicalSource)[], logicalTypes: string[]): ICanonical<this> {
        return ArrayCanonical.from<TElem>(
            value.map((x) => x._peekCanonicalRepresentation()),
            logicalTypes
        );
    }

    protected _validate(v: (Value & ICanonicalSource)[], fail: (msg: string) => void): (Value & ICanonicalSource)[] | void {
        // First, validate all slots for proper type and presence.
        const itemClazzLike = Reflect.getOwnMetadata(ELEM_CLASS, Object.getPrototypeOf(this)) as ValueClassLike;
        if (!itemClazzLike) {
            throw new Error(
                `Instance of sequence class '${this.constructor.name}' does not have an item type defined, possibly because no '@arrayvalue()' class decorator is present.`
            );
        }
        const itemClazz = toValueClass(itemClazzLike);
        let ok = true;
        const expectedLogicalTypes = toValueClass(itemClazz).logicalTypes;
        for (const [idx, value] of v.entries()) {
            // This checks not only checks the proper class types (which may be too strict?), it also catches the case in which
            // the input is not a Value at all (but, for example, a ICanonical).
            if (!(value instanceof itemClazz)) {
                fail(
                    `Item '${idx}' with class '${Object.getPrototypeOf(value).constructor.name}' is not an instance of '${
                        itemClazz.name
                    }'`
                );
                ok = false;
                continue;
            }

            const valueLogicalTypes = value._logicalTypes;

            if (!aExtendsB(valueLogicalTypes, expectedLogicalTypes)) {
                fail(
                    `Value '${idx}' with logical types '${valueLogicalTypes.join(
                        '.'
                    )}' is not compatible with expected logical types '${expectedLogicalTypes.join('.')}'`
                );
                ok = false;
                continue;
            }
        }

        if (!ok) {
            return;
        }

        // Then, use this prevalidated map as input to custom validators for the struct. It makes little
        // sense to run such a validator on input that is invalid. That is why we do this after validation
        // of the individual slots.
        const validators = Reflect.getOwnMetadata(VALIDATORS, Object.getPrototypeOf(this)) as ValidatorFunc[] | undefined;
        if (validators) {
            let failed = false;
            for (const validator of validators) {
                validator(v, (msg: string) => {
                    fail(msg);
                    failed = true;
                });
                if (failed) {
                    break;
                }
            }
        }
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const items = this._checkItems();
        return ArrayCanonical.from(
            items.map((x) => x._peekCanonicalRepresentation()),
            this._logicalTypes
        );
    }

    private _checkItems(): SequenceArray<TElem> {
        if (this._items === undefined) {
            throw new Error(`Not allowed to access unfrozen structure`);
        }
        return this._items;
    }
}

export function ensureSequenceDefForConstructor<TElem extends Value>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor: Function,
    elemClass: Class<TElem> | (() => Class<TElem>) | undefined
) {
    const prototype = constructor.prototype;
    let itemClazz = Reflect.getOwnMetadata(ELEM_CLASS, prototype) as ValueClassLike;

    if (!itemClazz) {
        const parentItemClazz = Reflect.getMetadata(ELEM_CLASS, prototype);
        itemClazz = elemClass ?? parentItemClazz;

        Reflect.defineMetadata(ELEM_CLASS, itemClazz, prototype);
    }
}

export function sequencevalidation<T>(validator: (value: T[]) => string | boolean | void, description?: string) {
    return validation<T[]>(validator, description);
}

export function sequencevalue(elemClass: ValueClassLike, logicalName?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        valueobject(logicalName)(constructor);
        ensureSequenceDefForConstructor(constructor, elemClass);
    };
}

sequencevalue(Value, '')(SequenceValue);
