import { CanonicalLike, ICanonical, ICanonicalSource, MapCanonical, isCanonical, toCanonical } from '@darlean/canonical';
import {
    IValueDef,
    IValueObject,
    CanonicalType,
    CanonicalFieldName,
    getValueObjectDef,
    isValueObject,
    IValueClass,
    deriveTypeName,
    NativeStruct,
    NativeType,
    ValueDefLike,
    extractValueDef,
    ValueObject
} from './valueobject';

export type UnknownFieldAction = 'keep' | 'ignore' | 'error';

export interface IStructValueClass {
    DEF: StructDef;
}

export interface ISlotDef<TNative extends NativeType> {
    name: string;
    required: boolean;
    def: ValueDefLike<TNative>;
    propName?: string;
}

export type StructValidator = (value: Map<string, IValueObject | ICanonical>) => string | boolean | void | undefined;

export class StructDef implements IValueDef<NativeStruct> {
    private _types: CanonicalType[];
    private _slots: Map<string, ISlotDef<NativeType>>;
    private _requiredSlots: string[];
    private _unknownFieldAction: UnknownFieldAction = 'keep';
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;
    private _strictFieldNames: boolean;
    private _validators: { validator: StructValidator; description?: string }[];
    
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type?: CanonicalType, strictFieldNames = false) {
        this._template = template;
        this._types = type === '' ? [] : [type ?? deriveTypeName(template.name)];
        this._slots = new Map();
        this._requiredSlots = [];
        this._strictFieldNames = strictFieldNames;
        this._validators = [];

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

    public withBase(base: IStructValueClass | StructDef): StructDef {
        const base2 = base instanceof StructDef ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._types = [...base2.types, ...this._types];
        //this._validators = [...base2._validators, ...this._validators];
        for (const slot of base2.getSlots()) {
            if (slot.required) {
                this.withRequiredField(slot.name, slot.def);
            } else {
                this.withOptionalField(slot.name, slot.def);
            }
        }
        return this;
    }

    public withRequiredField<T extends NativeType>(name: CanonicalFieldName, def: ValueDefLike<T>, propName?: string): StructDef {
        if (this._strictFieldNames) {
            validateStrictFieldName(name);
        }
        this._slots.set(name, { name, required: true, def, propName });
        this._requiredSlots.push(name);
        return this;
    }

    public withOptionalField<T extends NativeType>(name: CanonicalFieldName, def: ValueDefLike<T>, propName?: string): StructDef {
        if (this._strictFieldNames) {
            validateStrictFieldName(name);
        }
        this._slots.set(name, { name, required: false, def: def, propName });
        return this;
    }

    public withExtensions(action: UnknownFieldAction): StructDef {
        this._unknownFieldAction = action;
        return this;
    }

    public withValidator(validator: StructValidator, description?: string): StructDef {
        this._validators.push({ validator, description });
        return this;
    }

    public getSlotDef<T extends NativeType>(name: string): ISlotDef<T> | undefined {
        const def = this._slots.get(name);
        if (!def) {
            if (this._unknownFieldAction === 'error') {
                throw new Error(`Unknown field: ${name}`);
            } else {
                return undefined;
            }
        }
        return def as ISlotDef<T>;
    }

    public getRequiredSlots(): string[] {
        return this._requiredSlots;
    }

    public getSlots(): IterableIterator<ISlotDef<NativeType>> {
        return this._slots.values();
    }

    public get strictFieldNames() {
        return this._strictFieldNames;
    }

    public get unknownFieldAction() {
        return this._unknownFieldAction;
    }

    get template() {
        return this._template;
    }

    public construct(value: ICanonical | NativeStruct): IValueObject {
        return Reflect.construct(this._template, [value, isCanonical(value) ? value : undefined]);
    }

    public constructFromSlots(value: ICanonical | NativeStruct): IValueObject {
        return Reflect.construct(this._template, [value, isCanonical(value) ? value : undefined, true]);
    }

    public hasType(type: CanonicalType) {
        return this._types.includes(type);
    }

    public from(value: ICanonical | NativeStruct): IValueObject {
        const vo = isValueObject(value);
        if (vo) {
            const ourType = this._types.at(-1);
            const voDef = getValueObjectDef(vo);
            if (ourType && voDef.hasType(ourType)) {
                return vo;
            } else if (ourType) {
                throw new Error(`Value object is not compatible with ${ourType}`);
            }
        }
        return this.construct(value);
    }

    public fromSlots(value: Map<string, ICanonical | IValueObject>): IValueObject {
        return this.constructFromSlots(value);
    }
}

export class StructValue extends ValueObject implements IValueObject, ICanonicalSource<typeof this> {
    static DEF = struct(StructValue, '');

    private _slots?: Map<string, IValueObject | ICanonical>;

    static required<T extends typeof StructValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof StructValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new struct value from a value that is a partial (subset of the fields) of T. The fields
     * should be in the exact casing as used in T. They are internally converted into the canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static from<T extends typeof StructValue>(this: T, value: Partial<Omit<InstanceType<T>, keyof StructValue>>): InstanceType<T> {
        const v2: { [key: string]: unknown } = {};
        if (value instanceof Map) {
            for (const [k, v] of value.entries()) {
                v2[k as string] = v;
            }
        } else {
            for (const [k, v] of Object.entries(value)) {
                v2[k] = v;
            }
        }

        const def = (this as unknown as IValueClass<NativeType, InstanceType<T>>).DEF;
        return def.from(v2) as InstanceType<T>;
    }

    /**
     * Creates a new struct value from a map or dictionary. The casing of the field names is literally preserved: no conversions
     * to canonical field names are performed, and the names also do not have to follow the convention for
     * canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static fromMap<T extends typeof StructValue>(this: T, value: {[key: string]: ICanonical | IValueObject} | Map<string, ICanonical | IValueObject>): InstanceType<T> {
        const v2: Map<string, ICanonical | IValueObject> = new Map();
        if (value instanceof Map) {
            for (const [k, v] of value.entries()) {
                v2.set(k, v);
            }
        } else {
            for (const [k, v] of Object.entries(value)) {
                v2.set(k, v);
            }
        }

        const def = (this as unknown as IStructValueClass).DEF;
        return def.fromSlots(v2) as InstanceType<T>;
    }

    /**
     * Creates a new struct value from a map of slot keys and values. The slot names
     * should be canonicalized names.
     * The values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static fromSlots<T extends typeof StructValue>(this: T, value: Map<string, ICanonical | IValueObject>): InstanceType<T> {
        return (this as unknown as IStructValueClass).DEF.fromSlots(value) as InstanceType<T>;
    }

    /**
     * Creates a new struct value from a map of slot keys and values. The slot names
     * should be canonicalized names.
     * The values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static fromCanonical<T extends typeof StructValue>(this: T, value: CanonicalLike<InstanceType<T>>): InstanceType<T> {
        return (this as unknown as IStructValueClass).DEF.from(toCanonical(value)) as InstanceType<T>;
    }

    /**
     * Creates a new struct value instance using the provided value. Regardless of whether the value is an ICanonical or
     * a NativeStruct (object), the field names must already be canonicalized. That also counts for field names of nested
     * values.
     * @param value
     */
    constructor(value: ICanonical | NativeStruct, canonical: ICanonical | undefined, canonicalizedSlotNames = false) {
        super(canonical);
        const proto = this.constructor as unknown as IStructValueClass;
        if (proto.DEF.template !== this.constructor) {
            throw new Error(
                `No definition for struct of type "${this.constructor.name}". Did you decorate the class with "@structvalue()"?`
            );
        }

        this._slots = validateStruct(proto.DEF, value, !canonicalizedSlotNames);
    }

    public _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(
            slots as unknown as Map<string, ICanonical | ICanonicalSource<unknown>>,
            (Object.getPrototypeOf(this).constructor as IStructValueClass).DEF.types
        );
    }

    public get(slot: string): IValueObject | CanonicalLike | undefined {
        return this._checkSlots().get(slot);
    }

    /**
     * Extracts the current slots and their values. Slot names are returned as canonicalized names.
     */
    public _extractSlots(): Map<string, ICanonical | IValueObject> {
        const slots = this._checkSlots();
        this._slots = undefined;
        return slots;
    }

    public _req<T>(name: string): T {
        return this._checkSlots()?.get(name) as T;
    }

    public _opt<T>(name: string): T | undefined {
        return this._checkSlots().get(name) as T | undefined;
    }

    private _checkSlots(): Map<string, IValueObject | ICanonical> {
        if (this._slots === undefined) {
            throw new Error(`Not allowed to access unfrozen structure`);
        }
        return this._slots;
    }
}

function validateStruct(
    def: StructDef,
    input: ICanonical | NativeStruct,
    canonicalizeSlotNames : boolean
): Map<string, IValueObject | ICanonical> {
    const slots = new Map<string, IValueObject | ICanonical>();

    function addValue(key: string, value: ICanonical | IValueObject) {
        if (def.strictFieldNames) {
            validateStrictFieldName(key);
        }

        const slotDef = def.getSlotDef(key);
        if (slotDef) {
            const slotDefDef = extractValueDef(slotDef.def);
            const instance = slotDefDef.from(value);
            slots.set(key, instance);
        } else {
            switch (def.unknownFieldAction) {
                case 'keep':
                    slots.set(key, value);
                    break;
                case 'error':
                    throw new Error(`Unexpected field "${key}"`);
            }
        }
    }

    if ((input as ICanonical).firstMappingEntry) {
        let entry = (input as ICanonical).firstMappingEntry;
        while (entry) {
            const key = entry.key;
            const value = entry.value;
            addValue(key, value);
            entry = entry.next();
        }
    } else {
        // Native struct. Native struct field names must be in native format.
        const slotIterator = input instanceof Map ? input.entries() : Object.entries(input);
        for (const [key, value] of slotIterator) {
            const canonicalizedKey = canonicalizeSlotNames ? deriveTypeName(key) : key;
            addValue(canonicalizedKey, value);
        }
    }

    for (const slot of def.getRequiredSlots()) {
        if (!slots.has(slot)) {
            throw new Error(`Required field "${slot}" is missing`);
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
            throw new Error(`Invalid contents for struct of type "${def.types.at(-1)}": ${result}`);
        } else if (validator.description) {
            throw new Error(`Invalid contents for struct of type "${def.types.at(-1)}": ${validator.description}`);
        }
        throw new Error(`Invalid contents for struct of type "${def.types.at(-1)}"`);
    }

    return slots;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function struct(template: Function, type?: CanonicalType): StructDef {
    const def = new StructDef(template, type);
    (template as unknown as IStructValueClass).DEF = def;
    return def;
}

export function validateStrictFieldName(name: CanonicalFieldName) {
    // TODO: Add a cache for this
    for (const char of name) {
        const ok = (char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || char === '-';
        if (!ok) {
            throw new Error(`Field name "${name}" contains illegal characters (allowed are a-z, 9-0 and -)`);
        }
    }
}

export const structv = struct;

// eslint-disable-next-line @typescript-eslint/ban-types
export function objectv(template: Function, type?: CanonicalType): StructDef {
    const def = new StructDef(template, type, true).withExtensions('error');
    (template as unknown as IStructValueClass).DEF = def;
    return def;
}

export const ObjectValue = StructValue;
export const MappingValue = StructValue;
