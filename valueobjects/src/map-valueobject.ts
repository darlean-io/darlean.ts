import { CanonicalLike, ICanonical, ICanonicalSource, MapCanonical, isCanonical, toCanonical } from '@darlean/canonical';
import {
    IValueDef,
    IValueObject,
    CanonicalType,
    getValueObjectDef,
    isValueObject,
    deriveTypeName,
    NativeStruct,
    ValueDefLike,
    extractValueDef,
    ValueObject
} from './valueobject';

export interface IMapValueClass<TValue extends IValueObject = IValueObject> {
    DEF: MapDef<TValue>;
}

export type MapValidator = (value: Map<string, IValueObject | ICanonical>) => string | boolean | void | undefined;

export class MapDef<TValue extends IValueObject = IValueObject> implements IValueDef<NativeStruct> {
    private _types: CanonicalType[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;
    private _validators: { validator: MapValidator; description?: string }[];
    private _valueDef?: ValueDefLike<never, TValue>;
    private _elementTypeDef?: ValueDefLike<never, TValue>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type?: CanonicalType, elementTypeDef?: ValueDefLike<never, TValue>) {
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

    public get valueDef() {
        return this._valueDef;
    }

    public withBase(base: IMapValueClass<TValue> | MapDef<TValue>): MapDef<TValue> {
        const base2 = base instanceof MapDef ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._types = [...base2.types, ...this._types];
        //this._validators = [...base2._validators, ...this._validators];
        this._valueDef = base2._valueDef;
        return this;
    }

    public withValidator(validator: MapValidator, description?: string): MapDef<TValue> {
        this._validators.push({ validator, description });
        return this;
    }

    get template() {
        return this._template;
    }

    public construct(value: ICanonical | NativeStruct): IValueObject {
        return Reflect.construct(this._template, [value, isCanonical(value) ? value : undefined]);
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
}

export class MapValue<TValue extends IValueObject = IValueObject>
    extends ValueObject
    implements IValueObject, ICanonicalSource<typeof this>
{
    static DEF = map(MapValue, '');

    private _slots?: Map<string, TValue | ICanonical<TValue>>;

    static required<T extends typeof MapValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof MapValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new map value from a map or dictionary. The casing of the field names is literally preserved: no conversions
     * to canonical field names are performed, and the names also do not have to follow the convention for
     * canonical field names.
     * Their values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static from<T extends typeof MapValue<TValue>, TValue extends IValueObject>(
        this: T,
        value: { [key: string]: ICanonical<TValue> | TValue } | Map<string, ICanonical<TValue> | TValue>
    ): InstanceType<T> {
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

        const def = (this as unknown as IMapValueClass).DEF;
        return def.from(v2) as InstanceType<T>;
    }

    /**
     * Creates a new map value from a canonical like mapping.
     * The values must be value objects (like StringValue or derived classes); not native types (like string).
     */
    static fromCanonical<T extends typeof MapValue>(this: T, value: CanonicalLike<InstanceType<T>>): InstanceType<T> {
        return (this as unknown as IMapValueClass).DEF.from(toCanonical(value)) as InstanceType<T>;
    }

    /**
     * Creates a new map value instance using the provided value. The field names are taken literally (not converted to canonical
     * format). Field names of nested values must already be in canonical format.
     * @param value
     */
    constructor(value: ICanonical | NativeStruct, canonical: ICanonical | undefined) {
        super(canonical);
        const proto = this.constructor as unknown as IMapValueClass<TValue>;
        if (proto.DEF.template !== this.constructor) {
            throw new Error(
                `No definition for struct of type "${this.constructor.name}". Did you decorate the class with "@structvalue()"?`
            );
        }

        this._slots = validateMap<TValue>(proto.DEF, value);
    }

    public _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(
            slots as unknown as Map<string, ICanonical | ICanonicalSource<unknown>>,
            (Object.getPrototypeOf(this).constructor as IMapValueClass<TValue>).DEF.types
        );
    }

    public get(slot: string): IValueObject | CanonicalLike | undefined {
        return this._checkSlots().get(slot);
    }

    public has(slot: string): boolean {
        return this._checkSlots().has(slot);
    }

    public keys(): IterableIterator<string> {
        return this._checkSlots().keys();
    }

    public values(): IterableIterator<TValue | ICanonical<TValue>> {
        return this._checkSlots().values();
    }

    /**
     * Extracts the current slots and their values.
     */
    public _extractSlots(): Map<string, TValue | ICanonical<TValue>> {
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

    private _checkSlots(): Map<string, TValue | ICanonical<TValue>> {
        if (this._slots === undefined) {
            throw new Error(`Not allowed to access unfrozen map`);
        }
        return this._slots;
    }
}

function validateMap<TValue extends IValueObject = IValueObject>(
    def: MapDef<TValue>,
    input: ICanonical | NativeStruct
): Map<string, TValue | ICanonical<TValue>> {
    const slots = new Map<string, TValue | ICanonical<TValue>>();

    function addValue(key: string, value: ICanonical | TValue) {
        const valueDef = def.valueDef;
        if (valueDef) {
            const valueDefDef = extractValueDef(valueDef);
            const instance = valueDefDef.from(value);
            slots.set(key, instance);
        } else {
            slots.set(key, value);
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
            throw new Error(`Invalid contents for map of type "${def.types.at(-1)}": ${result}`);
        } else if (validator.description) {
            throw new Error(`Invalid contents for map of type "${def.types.at(-1)}": ${validator.description}`);
        }
        throw new Error(`Invalid contents for map of type "${def.types.at(-1)}"`);
    }

    return slots;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function map<TValue extends IValueObject = IValueObject>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    template: Function,
    type?: CanonicalType,
    elementTypeDef?: ValueDefLike<never, TValue>
): MapDef<TValue> {
    const def = new MapDef<TValue>(template, type, elementTypeDef);
    (template as unknown as IMapValueClass<TValue>).DEF = def;
    return def;
}

export const mapv = map;
