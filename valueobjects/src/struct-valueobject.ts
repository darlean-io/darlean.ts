import { ICanonical, ICanonicalSource, isCanonicalLike, MapCanonical, toCanonical } from '@darlean/canonical';
import { CanonicalFieldName, deriveTypeName, Class, ValidationError } from './valueobject';
import { NoInfer } from './utils';
import {
    aExtendsB,
    checkLogicalTypes,
    constructValue,
    IFromCanonicalOptions,
    IValueOptions,
    LOGICAL_TYPES,
    MethodKeys,
    shouldCacheCanonical,
    toValueClass,
    validation,
    ValidatorFunc,
    VALIDATORS,
    Value,
    ValueClass,
    ValueClassLike
} from './base';

export type UnknownFieldAction = 'ignore' | 'error';

export interface ISlotDef<TValue extends Value> {
    name: string;
    required: boolean;
    clazz: ValueClassLike<TValue>;
}

const STRUCT_DEF = 'struct-def';

type StructMap = Map<CanonicalFieldName, Value & ICanonicalSource>;

export interface IStructValueOptions {
    unknownFieldAction?: UnknownFieldAction;
}

export function structvalue(logicalName?: string, options?: IStructValueOptions) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        const name = logicalName === undefined ? deriveTypeName(constructor.name) : logicalName;
        let names = Reflect.getOwnMetadata(LOGICAL_TYPES, constructor.prototype);
        if (!names) {
            if (name === '') {
                names = [...((Reflect.getMetadata(LOGICAL_TYPES, constructor.prototype) as string[] | undefined) ?? [])];
            } else {
                names = [...((Reflect.getMetadata(LOGICAL_TYPES, constructor.prototype) as string[] | undefined) ?? []), name];
            }
            Reflect.defineMetadata(LOGICAL_TYPES, names, constructor.prototype);
        } else {
            if (name !== '') {
                names.push(name);
            }
        }

        ensureStructDefForConstructor(constructor, options?.unknownFieldAction);
    };
}

export class StructDef {
    private _slots: Map<CanonicalFieldName, ISlotDef<Value>>;
    private _requiredSlots: string[];
    private _unknownFieldAction: UnknownFieldAction = 'error';

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(parentDef?: StructDef) {
        this._slots = new Map();
        this._requiredSlots = [];

        if (parentDef) {
            for (const slot of parentDef.getSlots()) {
                if (slot.required) {
                    this.withRequiredField(slot.name, slot.clazz);
                } else {
                    this.withOptionalField(slot.name, slot.clazz);
                }
            }
        }
    }

    public withRequiredField(name: CanonicalFieldName, def: ValueClassLike<Value>): StructDef {
        validateStrictFieldName(name);
        this._slots.set(name, { name, required: true, clazz: def });
        this._requiredSlots.push(name);
        return this;
    }

    public withOptionalField<TFieldValue extends Value>(name: CanonicalFieldName, def: ValueClassLike<TFieldValue>): StructDef {
        validateStrictFieldName(name);
        this._slots.set(name, { name, required: false, clazz: def });
        return this;
    }

    public withUnknownFieldAction(action: UnknownFieldAction) {
        this._unknownFieldAction = action;
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
}

// Helper that contains some useful framework functions that are made accessable by a StructValue
// by means of its `_` property. By using this construct, we only need one `_` member, which
// keeps the code completion options clean.
export interface StructValueUnderscore {
    extractSlots(): StructMap;
    req<T>(name: CanonicalFieldName): T;
    opt<T>(name: CanonicalFieldName): T | undefined;
    checkSlots(): Map<CanonicalFieldName, Value>;
    get(slot: CanonicalFieldName): (Value & ICanonicalSource) | undefined;
    keys(): IterableIterator<CanonicalFieldName>;
    values(): IterableIterator<Value & ICanonicalSource>;
    entries(): IterableIterator<[CanonicalFieldName, Value & ICanonicalSource]>;
    get size(): number;
}

export class StructValue extends Value implements ICanonicalSource {
    private _slots?: StructMap;
    private _canonical?: ICanonical;

    static required<T>(this: Class<T>): T {
        return { required: true, clazz: this } as unknown as T;
    }

    static optional<T>(this: Class<T>): T | undefined {
        return { required: false, clazz: this } as unknown as T;
    }

    /**
     * Creates a new struct value from a value that contains all of the fields of T. The fields
     * should be in the exact (native) casing as used in T. They are internally converted into the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    public static from<T extends StructValue, T2 = NoInfer<T>>(
        this: Class<T>,
        value: Omit<T2, keyof StructValue | MethodKeys<T2>>
    ): T {
        const options: IValueOptions = { value };
        return constructValue(this, options);
    }

    /**
     * Creates a new struct value from a value that is a partial (subset of the fields) of T. The fields
     * should be in the exact casing as used in T. They are internally converted into the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    public static fromPartial<T extends StructValue, T2 = NoInfer<T>>(
        this: Class<T>,
        value: Partial<Omit<T2, keyof StructValue>>
    ): T {
        const options: IValueOptions = { value };
        return constructValue(this, options);
    }

    /**
     * Creates a new struct value from a base value (of the same type) that is enricheded with a partial
     * (subset of the fields) of T. The fields should be in the exact casing as used in T. They are internally converted into
     * the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string). Defined values
     * (that is, not having the value `undefined`) override the corresponding value in the output struct; values that are explicitly
     * undefined remove cause the corresponding key not to be present in the output struct.
     */
    public static fromBase<T extends StructValue>(
        this: Class<T>,
        base: NoInfer<T>,
        value: Partial<Omit<NoInfer<T>, keyof StructValue>>
    ): T {
        const map: StructMap = new Map((base as StructValue)._entries());
        for (const [key, v] of Object.entries(value)) {
            map.set(deriveTypeName(key), v as Value & ICanonicalSource);
        }
        const options: IValueOptions = { value: map };
        return constructValue(this, options);
    }

    public static fromCanonical<T extends StructValue>(this: Class<T>, value: ICanonical, options?: IFromCanonicalOptions) {
        const valueoptions: IValueOptions = { canonical: value, cacheCanonical: options?.cacheCanonical };
        return constructValue(this, valueoptions);
    }

    public static fromSlots<T extends StructValue>(this: Class<T>, value: StructMap) {
        const options: IValueOptions = { value };
        return constructValue(this, options);
    }

    /**
     * Creates a new struct value instance using the provided value. Regardless of whether the value is an ICanonical or
     * a Map, the field names must already be canonicalized. That also counts for field names of nested
     * values. When value is an object (`{..}`), the field names must *not* yet be canonicalized.
     * @param value
     */
    constructor(options: IValueOptions) {
        super(options);

        let v: StructMap = new Map();
        if (options.canonical) {
            const canonical = toCanonical(options.canonical);
            const logicalTypes = checkLogicalTypes(Object.getPrototypeOf(this));
            if (!canonical.is(logicalTypes)) {
                throw new ValidationError(
                    `Incoming value of logical types '${canonical.logicalTypes.join(
                        '.'
                    )}' is not compatible with '${logicalTypes.join('.')}'`
                );
            }
            if (shouldCacheCanonical(canonical, logicalTypes, options?.cacheCanonical)) {
                this._canonical = canonical;
            }

            v = this._fromCanonical(canonical, options);
        } else if (options.value instanceof Map) {
            // We have a StructMap with already canonical named fields
            for (const [canonicalName, value] of options.value.entries()) {
                if (value === undefined) {
                    continue;
                }
                v.set(canonicalName, value);
            }
        } else {
            for (const [name, value] of Object.entries(options.value as { [name: string]: Value & ICanonicalSource })) {
                const canonicalName = deriveTypeName(name);
                if (value === undefined) {
                    continue;
                }
                v.set(canonicalName, value);
            }
        }
        const msgs: string[] = [];
        const validated = this._validate(v, (msg: string) => msgs.push(msg));
        if (msgs.length > 0) {
            throw new ValidationError(msgs.join('; '));
        }
        this._slots = (validated ?? v) as StructMap;
    }

    public _peekCanonicalRepresentation(): ICanonical<this> {
        if (this._canonical) {
            return this._canonical;
        }
        this._canonical = this._toCanonical(this._checkSlots(), this._logicalTypes);
        return this._canonical;
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

    public equals(other: unknown): boolean {
        if (!isCanonicalLike(other)) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other);
    }

    private _keys(): IterableIterator<CanonicalFieldName> {
        return this._checkSlots().keys();
    }

    private _values(): IterableIterator<Value & ICanonicalSource> {
        return this._checkSlots().values();
    }

    private _entries(): IterableIterator<[CanonicalFieldName, Value & ICanonicalSource]> {
        return this._checkSlots().entries();
    }

    public get _size() {
        return this._checkSlots().size;
    }

    public get _logicalTypes() {
        return (Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this)) ?? []) as string[];
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(slots, this._logicalTypes);
    }

    protected _get(slot: string): (Value & ICanonicalSource) | undefined {
        return this._checkSlots().get(slot);
    }

    protected _fromCanonical(canonical: ICanonical, options?: IFromCanonicalOptions): StructMap {
        const def = Reflect.getOwnMetadata(STRUCT_DEF, Object.getPrototypeOf(this)) as StructDef;
        const result: StructMap = new Map();
        let entry = canonical.firstMappingEntry;
        while (entry) {
            const slotDef = def.getSlotDef(entry.key);
            if (!slotDef) {
                continue;
            }

            const entryCan = toCanonical(entry.value);
            const value = constructValue(toValueClass(slotDef.clazz as ValueClassLike<Value & ICanonicalSource>), {
                cacheCanonical: options?.cacheCanonical,
                canonical: entryCan
            }) as Value & ICanonicalSource;
            result.set(entry.key, value);
            entry = entry.next();
        }
        return result;
    }

    protected _toCanonical(value: StructMap, logicalTypes: string[]): ICanonical<this> {
        return MapCanonical.from<this>(value, logicalTypes);
    }

    protected _validate(v: StructMap, fail: (msg: string) => void): StructMap | void {
        // First, validate all slots for proper type and presence.
        const proto = Object.getPrototypeOf(this);
        const def = Reflect.getOwnMetadata(STRUCT_DEF, proto) as StructDef;
        if (!def) {
            throw new Error(
                `Instance of struct class '${this.constructor.name}' does not have a definition, possibly because no '@structvalue()' class decorator is present.`
            );
        }
        let ok = true;
        for (const [name, value] of v.entries()) {
            const slotDef = def.getSlotDef(name);

            if (!slotDef) {
                continue;
            }

            // This checks not only checks the proper class types (which may be too strict?), it also catches the case in which
            // the input is not a Value at all (but, for example, a ICanonical).
            if (!(value instanceof slotDef.clazz)) {
                fail(
                    `Value '${name}' with class '${Object.getPrototypeOf(value).constructor.name}' is not an instance of '${
                        slotDef.clazz.name
                    }'`
                );
                ok = false;
                continue;
            }

            const slotLogicalTypes = toValueClass(slotDef.clazz).logicalTypes;
            const valueLogicalTypes = value._logicalTypes;

            if (!aExtendsB(valueLogicalTypes, slotLogicalTypes)) {
                fail(
                    `Value '${name}' with logical types '${slotLogicalTypes.join(
                        '.'
                    )}' is not compatible with value with logical types '${valueLogicalTypes.join('.')}'`
                );
                ok = false;
                continue;
            }
        }

        for (const required of def.getRequiredSlots()) {
            if (!v.has(required)) {
                fail(`Required value '${required}' is missing`);
                ok = false;
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
export function ensureStructDefForConstructor(constructor: Function, extensions?: UnknownFieldAction) {
    let needsInit = false;
    const prototype = constructor.prototype;
    let def = Reflect.getOwnMetadata(STRUCT_DEF, prototype) as StructDef;

    if (!def) {
        const parentDef = Reflect.getMetadata(STRUCT_DEF, prototype);
        def = new StructDef(parentDef);
        if (extensions) {
            def.withUnknownFieldAction(extensions);
        }
        Reflect.defineMetadata(STRUCT_DEF, def, prototype);
        needsInit = true;
    }

    if (needsInit) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
            // Ignore special properties like '_'.
            if (name.startsWith('_')) {
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
                def.withRequiredField(canonicalName, info.clazz as ValueClass);
            } else {
                def.withOptionalField(canonicalName, info.clazz as ValueClass);
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

    return def;
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

export const structvalidation = validation<StructMap>;
structvalue('')(StructValue);
