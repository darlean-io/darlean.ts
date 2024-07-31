import { CanonicalLike, ICanonical, ICanonicalSource, MapCanonical, isCanonical, toCanonical } from '@darlean/canonical';
import {
    IValueDef,
    CanonicalType,
    deriveTypeName,
    BaseValueObject,
    Value,
    ValueClass,
    Class,
    ValidationError,
    NativeType
} from './valueobject';
import { getDefinitionForClass, setDefinitionForClass, typesIs, valueDefIs } from './utils';

export type AnyFieldName = string;

export type MappingMap<TElem extends Value> = Map<AnyFieldName, TElem>;
export type MappingValidator<TElem extends Value> = (value: MappingMap<TElem>) => string | boolean | void | undefined;

export class MappingDef<TValueClass extends ValueClass, TElem extends Value = Value>
    implements IValueDef<TValueClass, MappingMap<TElem>>
{
    private _types: CanonicalType[];
    private _ownTypes: CanonicalType[];
    private _slots: Map<AnyFieldName, TElem>;
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _valueClass: TValueClass;
    private _elemClass: Class<TElem> | undefined;
    private _validators: { validator: MappingValidator<TElem>; description?: string }[];
    private _baseDef?: MappingDef<ValueClass>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(valueClass: TValueClass, elemClass: Class<TElem> | undefined, type?: CanonicalType) {
        this._valueClass = valueClass;
        this._ownTypes = type === '' ? [] : [type ?? deriveTypeName(valueClass.name)];
        this._types = this._ownTypes;
        this._slots = new Map();
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

    public withBase<TBaseClass extends ValueClass>(base: TBaseClass): MappingDef<TValueClass, TElem> {
        const def = getDefinitionForClass(base);
        if (!def) {
            // Somewhere high enough up the inheritance chain we may encounter a base object without a def.
            // Maybe we should fix that and then raise an exception if that happens, but for now,
            // let's silently return.
            return this;
        }

        const baseDef = (this._baseDef = def as unknown as MappingDef<TBaseClass>);
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

    public withValidator(validator: MappingValidator<TElem>, description?: string): MappingDef<TValueClass, TElem> {
        this._validators.push({ validator, description });
        return this;
    }

    public getSlots(): IterableIterator<TElem> {
        return this._slots.values();
    }

    public construct(canonical: ICanonical | undefined, value: MappingMap<TElem> | ICanonical): InstanceType<TValueClass> {
        return Reflect.construct(this._valueClass, [this, canonical, value]) as InstanceType<TValueClass>;
    }

    public from(value: { [key: AnyFieldName]: TElem } | MappingMap<TElem> | ICanonical | Value): InstanceType<TValueClass> {
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
            const map = new Map<AnyFieldName, TElem>();
            for (const [k, v] of Object.entries(value)) {
                // v should be a TElem -- otherwise it is not conform the signature of our fields
                // When not, the validation will complain later on.
                map.set(k, v as TElem);
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

    public validate(input: MappingMap<TElem> | ICanonical): MappingMap<TElem> {
        const slots = new Map<AnyFieldName, TElem>();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const def = this;

        if (!this._elemClass) {
            throw new Error('No element class defined for mapping');
        }
        const elemDef = getDefinitionForClass(this._elemClass);

        function addValue(key: string, value: ICanonical | Value) {
            const instance = elemDef.fromCanonical(value);
            slots.set(key, instance);
        }

        if (isCanonical(input)) {
            let entry = (input as ICanonical).firstMappingEntry;
            while (entry) {
                const value = entry.value;
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
                throw new ValidationError(`Invalid contents for mapping of type "${def.types.at(-1)}": ${result}`);
            } else if (validator.description) {
                throw new ValidationError(`Invalid contents for mapping of type "${def.types.at(-1)}": ${validator.description}`);
            }
            throw new ValidationError(`Invalid contents for mapping of type "${def.types.at(-1)}"`);
        }

        return slots;
    }
}

// Helper that contains some useful framework functions that are made accessable by a MappingValue
// by means of its `_` property. By using this construct, we only need one `_` member, which
// keeps the code completion options clean.
export interface MappingValueUnderscore<TElem extends Value> {
    checkSlots(): Map<AnyFieldName, TElem>;
    get(slot: AnyFieldName): TElem | undefined;
}

export class MappingValue<TElem extends Value> extends BaseValueObject implements ICanonicalSource {
    private _slots?: Map<AnyFieldName, TElem>;

    static required<T extends typeof MappingValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof MappingValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new mapping value.
     */
    public static from<T extends MappingValue<TElem2>, TElem2 extends Value = T extends MappingValue<infer X> ? X : never>(
        this: Class<T>,
        value: ICanonical | Value | { [key: string]: TElem2 } | MappingMap<TElem2>
    ): T {
        const def = getDefinitionForClass(this) as MappingDef<Class<T>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return def.from(value as any);
    }

    /**
     * Creates a new mapping value instance using the provided value.
     * @param value
     */
    constructor(
        def: MappingDef<ValueClass<MappingValue<TElem>>, TElem>,
        canonical: ICanonical | undefined,
        value: MappingMap<TElem> | ICanonical
    ) {
        super(def, canonical);
        if (!def) {
            throw new ValidationError(
                `No definition for mapping of type "${this.constructor.name}". Did you decorate the class with "@mappingvalue()"?`
            );
        }

        this._slots = def.validate(value);
    }

    public get(slot: AnyFieldName): TElem | undefined {
        return this._checkSlots().get(slot);
    }

    public keys(): IterableIterator<string> {
        return this._checkSlots().keys();
    }

    public values(): IterableIterator<TElem> {
        return this._checkSlots().values();
    }

    public entries(): IterableIterator<[string, TElem]> {
        return this._checkSlots().entries();
    }

    public get size() {
        return this._checkSlots().size;
    }

    /**
     * Extracts the current slots and their values. After that, the mapping value should not be
     * used anymore and throws errors when you try to access values.
     */
    public extractSlots(): MappingMap<TElem> {
        const slots = this._checkSlots();
        this._slots = undefined;
        return slots;
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(slots, this._def.types);
    }

    private _checkSlots(): MappingMap<TElem> {
        if (this._slots === undefined) {
            throw new Error(`Not allowed to access unfrozen mapping`);
        }
        return this._slots;
    }
}

export function ensureMappingDefForConstructor<TElem extends Value>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor: Function,
    elemClass: Class<TElem> | undefined,
    type?: string
) {
    let def = getDefinitionForClass(constructor as ValueClass);
    if (!def) {
        def = setDefinitionForClass(
            constructor as ValueClass,
            new MappingDef<typeof MappingValue<TElem>>(constructor as typeof MappingValue<TElem>, elemClass, type)
        );
    } else if (type !== undefined) {
        (def as MappingDef<typeof MappingValue>).withType(type);
    }

    return def as MappingDef<typeof MappingValue, TElem>;
}

ensureMappingDefForConstructor(MappingValue, undefined, '');
