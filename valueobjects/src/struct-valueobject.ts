import { CanonicalLike, ICanonical, ICanonicalSource, MapCanonical, isCanonical, toCanonical } from '@darlean/canonical';
import {
    IValueDef,
    CanonicalType,
    CanonicalFieldName,
    deriveTypeName,
    BaseValueObject,
    ValueClassLike,
    Value,
    ValueClass,
    Class,
    ValidationError,
    NativeType
} from './valueobject';
import { getDefinitionForClass, setDefinitionForClass, typesIs, valueDefIs, NoInfer } from './utils';
import { CanonicalValue } from './primitive-valueobject';

export type UnknownFieldAction = 'keep' | 'ignore' | 'error';

export interface ISlotDef<TValue extends Value> {
    name: string;
    required: boolean;
    clazz: ValueClassLike<TValue>;
}

export type StructMap = Map<CanonicalFieldName, Value>;
export type StructValidator = (value: StructMap) => string | boolean | void | undefined;

export class StructDef<TValueClass extends ValueClass> implements IValueDef<TValueClass, StructMap> {
    private _types: CanonicalType[];
    private _ownTypes: CanonicalType[];
    private _slots: Map<CanonicalFieldName, ISlotDef<Value>>;
    private _requiredSlots: string[];
    private _unknownFieldAction: UnknownFieldAction = 'keep';
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _valueClass: TValueClass;
    private _validators: { validator: StructValidator; description?: string }[];
    private _baseDef?: StructDef<ValueClass>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(valueClass: TValueClass, type?: CanonicalType) {
        this._valueClass = valueClass;
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(valueClass.name)];
        this._types = this._ownTypes;
        this._slots = new Map();
        this._requiredSlots = [];
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

    public withBase<TBaseClass extends ValueClass>(base: TBaseClass): StructDef<TValueClass> {
        const def = getDefinitionForClass(base);
        if (!def) {
            // Somewhere high enough up the inheritance chain we may encounter a base object without a def.
            // Maybe we should fix that and then raise an exception if that happens, but for now,
            // let's silently return.
            return this;
        }

        const baseDef = (this._baseDef = def as unknown as StructDef<TBaseClass>);
        this._types = [...baseDef.types, ...this._ownTypes];
        this._validators = [...baseDef._validators, ...this._validators];

        for (const slot of baseDef.getSlots()) {
            if (slot.required) {
                this.withRequiredField(slot.name, slot.clazz);
            } else {
                this.withOptionalField(slot.name, slot.clazz);
            }
        }
        return this;
    }

    public withType(type: string) {
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(this._valueClass.name)];
        this._types = this._baseDef ? [...this._baseDef.types, ...this._ownTypes] : this._ownTypes;
    }

    public withRequiredField<TFieldValue extends Value>(
        name: CanonicalFieldName,
        def: ValueClassLike<TFieldValue>
    ): StructDef<TValueClass> {
        validateStrictFieldName(name);
        this._slots.set(name, { name, required: true, clazz: def });
        this._requiredSlots.push(name);
        return this;
    }

    public withOptionalField<TFieldValue extends Value>(
        name: CanonicalFieldName,
        def: ValueClassLike<TFieldValue>
    ): StructDef<TValueClass> {
        validateStrictFieldName(name);
        this._slots.set(name, { name, required: false, clazz: def });
        return this;
    }

    public withExtensions(action: UnknownFieldAction): StructDef<TValueClass> {
        this._unknownFieldAction = action;
        return this;
    }

    public withValidator(validator: StructValidator, description?: string): StructDef<TValueClass> {
        this._validators.push({ validator, description });
        return this;
    }

    public getSlotDef<TSlotValue extends Value>(name: string): ISlotDef<TSlotValue> | undefined {
        const def = this._slots.get(name);
        if (!def) {
            if (this._unknownFieldAction === 'error') {
                throw new ValidationError(`Unknown field: ${name}`);
            } else {
                return undefined;
            }
        }
        return def as ISlotDef<TSlotValue>;
    }

    public getRequiredSlots(): string[] {
        return this._requiredSlots;
    }

    public getSlots(): IterableIterator<ISlotDef<Value>> {
        return this._slots.values();
    }

    public get unknownFieldAction() {
        return this._unknownFieldAction;
    }

    get template() {
        return this._valueClass;
    }

    public construct(canonical: ICanonical | undefined, value: StructMap | ICanonical): InstanceType<TValueClass> {
        return Reflect.construct(this._valueClass, [this, canonical, value]) as InstanceType<TValueClass>;
    }

    public from(
        value: Partial<Omit<InstanceType<TValueClass>, keyof StructValue>> | StructMap | ICanonical | Value
    ): InstanceType<TValueClass> {
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
        } else if (value instanceof Map) {
            return this.construct(undefined, value);
        } else {
            const map = new Map<CanonicalFieldName, Value>();
            for (const [k, v] of Object.entries(value)) {
                const canonicalKey = deriveTypeName(k);
                // v should be a Value -- otherwise it is not conform the signature of our fields
                map.set(canonicalKey, v as Value);
            }
            return this.construct(undefined, map);
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

    public validate(input: StructMap | ICanonical): StructMap {
        const slots = new Map<CanonicalFieldName, Value>();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const def = this;

        function addValue(key: string, value: ICanonical | Value) {
            validateStrictFieldName(key);

            const slotDef = def.getSlotDef(key);
            if (slotDef) {
                const slotDefDef = getDefinitionForClass(slotDef.clazz);
                const instance = slotDefDef.fromCanonical(value);

                slots.set(key, instance);
            } else {
                switch (def.unknownFieldAction) {
                    case 'keep':
                        slots.set(key, CanonicalValue.from(value));
                        break;
                    case 'error':
                        throw new ValidationError(`Unexpected field "${key}"`);
                }
            }
        }

        if (isCanonical(input)) {
            let entry = (input as ICanonical).firstMappingEntry;
            while (entry) {
                const value = entry.value;
                if (value === undefined) {
                    continue;
                }

                const key = entry.key;
                addValue(key, value as Value | ICanonical);
                entry = entry.next();
            }
        } else {
            for (const [key, value] of input.entries()) {
                if (value === undefined) {
                    continue;
                }
                addValue(key, value);
            }
        }

        for (const slot of def.getRequiredSlots()) {
            if (!slots.has(slot)) {
                throw new ValidationError(`Required field "${slot}" is missing`);
            }
        }

        for (const validator of def.validators) {
            let result: string | boolean | undefined | void;
            try {
                result = validator.validator(slots);
            } catch (e) {
                result = (e as Error).message ?? false;
            }

            if (result === true || result === '' || result === undefined) {
                continue;
            }

            if (typeof result === 'string') {
                throw new ValidationError(`Invalid contents for struct of type "${def.types.at(-1)}": ${result}`);
            } else if (validator.description) {
                throw new ValidationError(`Invalid contents for struct of type "${def.types.at(-1)}": ${validator.description}`);
            }
            throw new ValidationError(`Invalid contents for struct of type "${def.types.at(-1)}"`);
        }

        return slots;
    }
}

// Helper that contains some useful framework functions that are made accessable by a StructValue
// by means of its `_` property. By using this construct, we only need one `_` member, which
// keeps the code completion options clean.
export interface StructValueUnderscore {
    extractSlots(): Map<CanonicalFieldName, Value>;
    req<T>(name: CanonicalFieldName): T;
    opt<T>(name: CanonicalFieldName): T | undefined;
    checkSlots(): Map<CanonicalFieldName, Value>;
    get(slot: CanonicalFieldName): Value | undefined;
    keys(): IterableIterator<CanonicalFieldName>;
    values(): IterableIterator<Value>;
    entries(): IterableIterator<[CanonicalFieldName, Value]>;
    get size(): number;
}

export class StructValue extends BaseValueObject implements ICanonicalSource {
    private _slots?: Map<string, Value>;

    static required<T extends typeof StructValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof StructValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new struct value from a value that contains all of the fields of T. The fields
     * should be in the exact (native) casing as used in T. They are internally converted into the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    public static from<T extends StructValue, T2 = NoInfer<T>>(
        this: Class<T>,
        value: ICanonical | Value | Omit<T2, keyof StructValue> | StructMap
    ): T {
        const def = getDefinitionForClass(this) as StructDef<Class<T>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return def.from(value as any);
    }

    /**
     * Creates a new struct value from a value that is a partial (subset of the fields) of T. The fields
     * should be in the exact casing as used in T. They are internally converted into the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    public static fromPartial<T extends StructValue, T2 = NoInfer<T>>(
        this: Class<T>,
        value: ICanonical | Value | Partial<Omit<T2, keyof StructValue>> | StructMap
    ): T {
        const def = getDefinitionForClass(this) as StructDef<Class<T>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return def.from(value as any);
    }

    /**
     * Creates a new struct value instance using the provided value. Regardless of whether the value is an ICanonical or
     * a NativeStruct (object), the field names must already be canonicalized. That also counts for field names of nested
     * values.
     * @param value
     */
    constructor(def: StructDef<ValueClass<StructValue>>, canonical: ICanonical | undefined, value: StructMap | ICanonical) {
        super(def, canonical);
        if (!def) {
            throw new ValidationError(
                `No definition for struct of type "${this.constructor.name}". Did you decorate the class with "@structvalue()"?`
            );
        }

        this._slots = def.validate(value);
    }

    public get _(): StructValueUnderscore {
        return {
            extractSlots: () => this._extractSlots(),
            req: (name) => this._req(name),
            opt: (name) => this._opt(name),
            checkSlots: () => this._checkSlots(),
            get: (slot) => this._get(slot),
            entries: () => this._entries(),
            keys: () => this._keys(),
            values: () => this._values(),
            size: this._size
        };
    }

    private _keys(): IterableIterator<CanonicalFieldName> {
        return this._checkSlots().keys();
    }

    private _values(): IterableIterator<Value> {
        return this._checkSlots().values();
    }

    private _entries(): IterableIterator<[CanonicalFieldName, Value]> {
        return this._checkSlots().entries();
    }

    public get _size() {
        return this._checkSlots().size;
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(slots, this._def.types);
    }

    protected _get(slot: string): Value | undefined {
        return this._checkSlots().get(slot);
    }

    /**
     * Extracts the current slots and their values. Slot names are returned as canonicalized names.
     */
    private _extractSlots(): StructMap {
        const slots = this._checkSlots();
        this._slots = undefined;
        return slots;
    }

    private _req<T>(name: CanonicalFieldName): T {
        return this._checkSlots()?.get(name) as T;
    }

    private _opt<T>(name: CanonicalFieldName): T | undefined {
        return this._checkSlots().get(name) as T | undefined;
    }

    private _checkSlots(): StructMap {
        if (this._slots === undefined) {
            throw new Error(`Not allowed to access unfrozen structure`);
        }
        return this._slots;
    }
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function ensureStructDefForConstructor(constructor: Function, type?: string, extensions?: UnknownFieldAction) {
    let needsInit = false;
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new StructDef<typeof StructValue>(constructor as typeof StructValue, type)
        );
        needsInit = true;
    } else if (type !== undefined) {
        (def as StructDef<typeof StructValue>).withType(type);
        needsInit = true;
    }

    if (needsInit) {
        const def2 = def as StructDef<typeof StructValue>;
        if (extensions) {
            def2.withExtensions(extensions);
        }

        const prototype = constructor.prototype;
        for (const name of Object.getOwnPropertyNames(prototype)) {
            if (name === '_') {
                continue;
            }

            const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
            if (!descriptor) {
                continue;
            }

            const originalGetter = descriptor.get;
            if (!originalGetter) {
                continue;
            }
            // eslint-disable-next-line @typescript-eslint/ban-types
            let info: { required: boolean; clazz: Function } | undefined;
            try {
                // eslint-disable-next-line @typescript-eslint/ban-types
                info = originalGetter() as { required: boolean; clazz: Function };
            } catch (e) {
                // As we do not provide a value for "this", most derived fields will simply throw a TypeError.
                // Just catch everything and assume there are no unintended side effects (it's a getter after all).
                if (e instanceof TypeError) {
                    continue;
                }
                throw e;
            }
            const canonicalName = deriveTypeName(name);
            if (info.required) {
                def2.withRequiredField(canonicalName, info.clazz as ValueClass);
            } else {
                def2.withOptionalField(canonicalName, info.clazz as ValueClass);
            }
            const required = info.required;
            descriptor.get = function () {
                return required
                    ? (this as unknown as StructValue)._.req(canonicalName)
                    : (this as unknown as StructValue)._.opt(canonicalName);
            };
            Object.defineProperty(prototype, name, descriptor);
        }
    }

    return def as StructDef<typeof StructValue>;
}

export function validateStrictFieldName(name: CanonicalFieldName) {
    // TODO: Add a cache for this
    for (const char of name) {
        const ok = (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || char === '-';
        if (!ok) {
            throw new ValidationError(`Field name "${name}" contains illegal characters (allowed are a-z, 9-0 and -)`);
        }
    }
}

ensureStructDefForConstructor(StructValue, '');
