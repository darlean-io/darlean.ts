import {
    ArrayCanonical,
    CanonicalLike,
    equals,
    ICanonical,
    ICanonicalSource,
    isCanonical,
    toCanonical
} from '@darlean/canonical';
import {
    IValueDef,
    CanonicalType,
    deriveTypeName,
    BaseValueObject,
    Value,
    ValueClass,
    Class,
    ValidationError,
    NativeType,
    FromValueFor
} from './valueobject';
import { getDefinitionForClass, setDefinitionForClass, typesIs, valueDefIs, NoInfer } from './utils';

export type SequenceArray<TElem extends Value> = TElem[];
export type SequenceValidator<TElem extends Value> = (value: SequenceArray<TElem>) => string | boolean | void | undefined;

export class SequenceDef<TValueClass extends ValueClass, TElem extends Value = Value>
    implements IValueDef<TValueClass, SequenceArray<TElem>, (TElem | ICanonical | FromValueFor<TElem>)[]>
{
    private _types: CanonicalType[];
    private _ownTypes: CanonicalType[];
    private _entries: TElem[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _valueClass: TValueClass;
    private _elemClass: Class<TElem> | undefined;
    private _validators: { validator: SequenceValidator<TElem>; description?: string }[];
    private _baseDef?: SequenceDef<ValueClass>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(valueClass: TValueClass, elemClass: Class<TElem> | undefined, type?: CanonicalType) {
        this._valueClass = valueClass;
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(valueClass.name)];
        this._types = this._ownTypes;
        this._entries = [];
        this._elemClass = elemClass;
        this._validators = [];

        const proto = Object.getPrototypeOf(valueClass);
        if (proto) {
            this.withBase(proto);
        }
    }

    public is(base: IValueDef<ValueClass, NativeType>): boolean {
        return valueDefIs(this, base);
    }

    public get types() {
        return this._types;
    }

    public get validators() {
        return this._validators;
    }

    public withBase<TBaseClass extends ValueClass>(base: TBaseClass): SequenceDef<TValueClass, TElem> {
        const def = getDefinitionForClass(base);
        if (!def) {
            // Somewhere high enough up the inheritance chain we may encounter a base object without a def.
            // Maybe we should fix that and then raise an exception if that happens, but for now,
            // let's silently return.
            return this;
        }

        const baseDef = (this._baseDef = def as unknown as SequenceDef<TBaseClass>);
        this._types = [...baseDef.types, ...this._ownTypes];
        this._validators = [...baseDef._validators, ...this._validators];
        if (!this._elemClass) {
            this._elemClass = baseDef._elemClass as Class<TElem>;
        }

        return this;
    }

    public withType(type: string) {
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(this._valueClass.name)];
        this._types = this._baseDef ? [...this._baseDef.types, ...this._ownTypes] : this._ownTypes;
    }

    public withValidator(validator: SequenceValidator<TElem>, description?: string): SequenceDef<TValueClass, TElem> {
        this._validators.push({ validator, description });
        return this;
    }

    public getValues(): IterableIterator<TElem> {
        return this._entries.values();
    }

    public construct(canonical: ICanonical | undefined, value: SequenceArray<TElem> | ICanonical): InstanceType<TValueClass> {
        return Reflect.construct(this._valueClass, [this, canonical, value]) as InstanceType<TValueClass>;
    }

    public from(value: (TElem | ICanonical | FromValueFor<TElem>)[] | ICanonical | Value): InstanceType<TValueClass> {
        if (value instanceof Value) {
            if (Object.getPrototypeOf(value) === this) {
                return value as InstanceType<TValueClass>;
            }

            const voDef = value._def;
            if (!voDef.is(this)) {
                throw new Error(
                    `Value object with type "${voDef.types.join('.')}" is not compatible with "${this.types.join('.')}"`
                );
            }
            return value as InstanceType<TValueClass>;
        } else if (isCanonical(value)) {
            return this.fromCanonical(value);
        } else {
            if (!this._elemClass) {
                throw new Error('No element class for sequence');
            }
            const elemDef = getDefinitionForClass(this._elemClass);
            const items: SequenceArray<TElem> = value.map((x) => elemDef.from(x));
            return this.construct(undefined, items);
        }
    }

    public *iterator(value: ICanonical | Value | (ICanonical | Value | NoInfer<FromValueFor<TElem>>)[]): Generator<TElem> {
        if (!this._elemClass) {
            throw new Error('No element class defined for mapping');
        }
        const elemDef = getDefinitionForClass(this._elemClass);

        if (value instanceof Value) {
            if (value instanceof SequenceValue) {
                for (const val of value.values()) {
                    yield val;
                }
                return;
            }
            const voDef = value._def;
            throw new Error(`Value object with type "${voDef.types.join('.')}" is not a sequence value`);
        } else if (isCanonical(value)) {
            let item = value.firstSequenceItem;
            while (item) {
                yield elemDef.fromCanonical(item.value);
                item = item.next();
            }
            return;
        } else {
            if (!this._elemClass) {
                throw new Error('No element class for sequence');
            }
            for (const item of value) {
                yield elemDef.from(item);
            }
            return;
        }
    }

    public fromCanonical(value: CanonicalLike<InstanceType<TValueClass>>): InstanceType<TValueClass> {
        const c = toCanonical(value);
        if (!typesIs(c.logicalTypes, this._types)) {
            throw new ValidationError(
                `Canonical object with type "${c.logicalTypes.join('.')}" is not compatible with "${this._types.join('.')}"`
            );
        }

        return this.construct(c, c);
    }

    public hasType(type: CanonicalType) {
        return this._types.includes(type);
    }

    public validate(input: SequenceArray<TElem> | ICanonical): SequenceArray<TElem> {
        const items: TElem[] = [];
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const def = this;

        if (!this._elemClass) {
            throw new Error('No element class defined for mapping');
        }
        const elemDef = getDefinitionForClass(this._elemClass);

        function addValue(value: ICanonical | Value) {
            const instance = elemDef.fromCanonical(value);
            items.push(instance);
        }

        if (isCanonical(input)) {
            let item = (input as ICanonical).firstSequenceItem;
            while (item) {
                const value = item.value;
                addValue(value as Value | ICanonical);
                item = item.next();
            }
        } else {
            for (const value of input) {
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
                throw new ValidationError(`Invalid contents for sequence of type "${def.types.at(-1)}": ${result}`);
            } else if (validator.description) {
                throw new ValidationError(
                    `Invalid contents for sequence of type "${def.types.at(-1)}": ${validator.description}`
                );
            }
            throw new ValidationError(`Invalid contents for sequence of type "${def.types.at(-1)}"`);
        }

        return items;
    }
}

export class SequenceValue<TElem extends Value<TElemFrom>, TElemFrom = TElem extends Value<infer X> ? X : never>
    extends BaseValueObject<(TElemFrom | ICanonical | TElem)[]>
    implements ICanonicalSource
{
    private _items?: TElem[];

    static required<T extends typeof SequenceValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof SequenceValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new sequence value.
     */
    public static from<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(this: Class<T>, value: ICanonical | Value | (ICanonical | Value | NoInfer<TFrom>)[]): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>>;
        return def.from(value);
    }

    /**
     * Creates a new sequence value by copying a template value multiple times.
     */
    public static fillFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(this: Class<T>, template: ICanonical | Value | NoInfer<TFrom>, repeat: number): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const items = new Array(repeat).fill(template);
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>>;
        return def.from(items);
    }

    /**
     * Creates a new sequence value by concatenating multiple arrays.
     */
    public static concatenateFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(this: Class<T>, ...arrays: (ICanonical | Value | (ICanonical | Value | NoInfer<TFrom>)[])[]): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const items: (ICanonical | Value | NoInfer<TFrom>)[] = [];
        for (const a of arrays) {
            if (Array.isArray(a)) {
                items.push(...a);
            } else if (isCanonical(a)) {
                let item = a.firstSequenceItem;
                while (item) {
                    items.push(toCanonical(item.value)); // TODO not efficient?
                    item = item.next();
                }
            } else if (a instanceof SequenceValue) {
                for (const item of a) {
                    items.push(item);
                }
            } else {
                throw new Error('Argument is not an array');
            }
        }
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>>;
        return def.from(items);
    }

    /**
     * Creates a new sequence value by mapping existing items.
     */
    public static mapFrom<
        SequenceSourceElem extends Value<SourceElem2>,
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        SourceElem = never,
        SourceElem2 = never,
        SSE2 = [SourceElem2] extends [never] ? never : SequenceSourceElem,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(
        this: Class<T>,
        source: SequenceValue<SequenceSourceElem, SourceElem2> | SourceElem[],
        mapFunc: (value: SourceElem | SSE2) => ICanonical | Value | NoInfer<TFrom>
    ): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const results = [];
        if (source instanceof SequenceValue) {
            for (const value of source.values()) {
                results.push(mapFunc(value as unknown as SSE2));
            }
        } else {
            for (const value of source.values()) {
                results.push(mapFunc(value));
            }
        }
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>>;
        return def.from(results);
    }

    /**
     * Creates a new sequence value by sorting the input array.
     * The provided sort func receives values of the element-type for this sequence value.
     * To please typescript, you may need to cast them explicitly to this type via `(a: MyType, b: MyType)`.
     */
    public static sortFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(
        this: Class<T>,
        value: ICanonical<T> | T | (ICanonical<TElem2> | TElem2 | NoInfer<TFrom>)[],
        sortFunc: (a: TElem2, b: TElem2) => number
    ): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>, TElem2>;
        const temp: TElem2[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const elem of def.iterator(value as any)) {
            temp.push(elem);
        }
        temp.sort(sortFunc);
        return def.from(temp);
    }

    /**
     * Creates a new sequence value by filtering the input array.
     * The provided sort func receives values of the element-type for this sequence value.
     * To please typescript, you may need to cast them explicitly to this type via `(value: MyType)`.
     */
    public static filterFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(
        this: Class<T>,
        value: ICanonical<T> | T | (ICanonical<TElem2> | TElem2 | NoInfer<TFrom>)[],
        filterFunc: (value: TElem2) => boolean
    ): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>, TElem2>;
        const temp: TElem2[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const elem of def.iterator(value as any)) {
            if (filterFunc(elem)) {
                temp.push(elem);
            }
        }
        return def.from(temp);
    }

    /**
     * Creates a new sequence value by slicing the input array.
     */
    public static sliceFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(
        this: Class<T>,
        value: ICanonical<T> | T | (ICanonical<TElem2> | TElem2 | NoInfer<TFrom>)[],
        start?: number,
        end?: number
    ): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>, TElem2>;
        const temp: TElem2[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const elem of def.iterator(value as any)) {
            temp.push(elem);
        }
        return def.from(temp.slice(start, end));
    }

    /**
     * Creates a new sequence value by reversing the input array.
     */
    public static reverseFrom<
        T extends SequenceValue<TElem2, FromValueFor<TElem2>>,
        TElem2 extends Value<TFrom> = T extends SequenceValue<infer X> ? X : never,
        TFrom = TElem2 extends Value<infer Y> ? Y : never
    >(this: Class<T>, value: ICanonical<T> | T | (ICanonical<TElem2> | TElem2 | NoInfer<TFrom>)[]): T {
        //ICanonical | Value<TFrom> | (TFrom | ICanonical | TElem2)[]): T {
        const def = getDefinitionForClass(this) as SequenceDef<Class<T>, TElem2>;
        const temp: TElem2[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const elem of def.iterator(value as any)) {
            temp.push(elem);
        }
        return def.from(temp.reverse());
    }

    /**
     * Creates a new mapping value instance using the provided value.
     * @param value
     */
    constructor(
        def: SequenceDef<ValueClass<SequenceValue<TElem>>, TElem>,
        canonical: ICanonical | undefined,
        value: SequenceArray<TElem> | ICanonical
    ) {
        super(def, canonical);
        if (!def) {
            throw new ValidationError(
                `No definition for sequence of type "${this.constructor.name}". Did you decorate the class with "@sequencevalue()"?`
            );
        }

        this._items = def.validate(value);
    }

    public get(index: number): TElem | undefined {
        return this._checkItems()[index];
    }

    public values(): IterableIterator<TElem> {
        return this._checkItems().values();
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

    protected _deriveCanonicalRepresentation(): ICanonical {
        const items = this._checkItems();
        return ArrayCanonical.from(
            items.map((x) => x._peekCanonicalRepresentation()),
            this._def.types
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
    elemClass: Class<TElem> | undefined,
    type?: string
) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new SequenceDef<typeof SequenceValue<TElem>>(constructor as typeof SequenceValue<TElem>, elemClass, type)
        );
    } else if (type !== undefined) {
        (def as SequenceDef<typeof SequenceValue>).withType(type);
    }

    return def as SequenceDef<typeof SequenceValue, TElem>;
}

ensureSequenceDefForConstructor(SequenceValue, undefined, '');
