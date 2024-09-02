import {
    ICanonical,
    ICanonicalSource,
    isCanonicalLike,
    MapCanonical,
    toCanonical
} from '@darlean/canonical';

import { aExtendsB, Class, constructValue, IValueOptions, LOGICAL_TYPES, toValueClass, validation, ValidatorFunc, VALIDATORS, Value, ValueClass, ValueClassLike, valueobject } from './base';
import { ValidationError } from './valueobject';
import { NoInfer } from './utils';

const ELEM_CLASS = 'elem-class';

type AnyFieldName = string;
type MappingMap<TElem extends Value & ICanonicalSource> = Map<AnyFieldName, TElem>;
type MappingDict<TElem extends Value & ICanonicalSource> = {[key: AnyFieldName]: TElem};

export class MappingValue<TElem extends Value & ICanonicalSource> extends Value implements ICanonicalSource
{
    private _slots?: MappingMap<TElem>;
    private _canonical?: ICanonical;

    static required<T extends typeof MappingValue>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<T extends typeof MappingValue>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    /**
     * Creates a new mapping value from a map of values.
     */
    public static from<
        T extends MappingValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends MappingValue<infer X> ? X : never
    >(this: Class<T>, value: MappingDict<NoInfer<TElem2>> | MappingMap<NoInfer<TElem2>>): T {
        const options: IValueOptions = { value };
        return constructValue(this, options);
    }

    public static fromCanonical<
        T extends MappingValue<TElem2>,
        TElem2 extends Value & ICanonicalSource = T extends MappingValue<infer X> ? X : never
    >(this: Class<T>, value: ICanonical) {
        const options: IValueOptions = { canonical: value };
        return Reflect.construct(this, [options]);
    }

    constructor(options: IValueOptions) {
        super(options);

        let v: MappingMap<TElem> = new Map();
        if (options.canonical) {
            this._canonical = toCanonical(options.canonical);
            const logicalTypes = Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this));
            const canonicalLogicalNames = this._canonical.logicalTypes;
            for (let idx=0; idx<logicalTypes.length; idx++) {
                if (logicalTypes[idx] !== canonicalLogicalNames[idx]) {
                    throw new ValidationError(`Incoming value of logical types '${canonicalLogicalNames.join('.')} is not compatible with '${logicalTypes.join('.')}`);
                }
            }
            v = this._fromCanonical(this._canonical) as MappingMap<TElem>;
        } else
        if (options.value instanceof Map) {
            for (const [name, value] of options.value.entries()) {
                if (value === undefined) {
                    continue;
                }
                v.set(name, value);
            }
        } else {
            for (const [name, value] of Object.entries(options.value as MappingDict<TElem>)) {
                if (value === undefined) {
                    continue;
                }
                v.set(name, value);
            }
        }
        const msgs: string[] = [];
        const validated = this._validate(v, (msg: string) => msgs.push(msg)) as MappingMap<TElem> | undefined;
        if (msgs.length > 0) {
            throw new ValidationError(msgs.join('; '));
        }
        this._slots = validated ?? v;
    }

    public _peekCanonicalRepresentation(): ICanonical<this> {
        if (this._canonical) {
            return this._canonical;
        }
        this._canonical = this._toCanonical(this._checkSlots(), this._logicalTypes);
        return this._canonical;
    }

    public equals(other: unknown): boolean {
        if (!isCanonicalLike(other)) {
            return false;
        }
        return this._peekCanonicalRepresentation().equals(other);
    }

    public keys(): IterableIterator<AnyFieldName> {
        return this._checkSlots().keys();
    }

    public values(): IterableIterator<TElem> {
        return this._checkSlots().values();
    }

    public entries(): IterableIterator<[AnyFieldName, TElem]> {
        return this._checkSlots().entries();
    }

    /**
     * Extracts the current slots and their values.
     */
    public _extractSlots(): MappingMap<TElem> {
        const slots = this._checkSlots();
        this._slots = undefined;
        return slots;
    }
    

    public get size() {
        return this._checkSlots().size;
    }

    public get _logicalTypes() { 
        return ((Reflect.getOwnMetadata(LOGICAL_TYPES, Object.getPrototypeOf(this)) ?? []) as string[]);
    }

    protected _deriveCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return MapCanonical.from(slots, this._logicalTypes);
    }

    public get(slot: string): TElem | undefined {
        return this._checkSlots().get(slot);
    }


    /**
     * Extracts the current elements. After that, the sequence value should not be
     * used anymore and throws errors when you try to access values.
     */
    public extractElements(): MappingMap<TElem> {
        const items = this._checkSlots();
        this._slots = undefined;
        return items;
    }

    protected _fromCanonical(canonical: ICanonical) {
        const itemClazz = Reflect.getOwnMetadata(ELEM_CLASS, Object.getPrototypeOf(this)) as ValueClassLike;
        const result: MappingMap<TElem> = new Map();
        let entry = canonical.firstMappingEntry;
        while (entry) {
            const entryCan = toCanonical(entry.value);
            const value = constructValue(toValueClass(itemClazz as ValueClassLike<Value & ICanonicalSource>), { canonical: entryCan }) as (Value & ICanonicalSource);
            result.set(entry.key, value as TElem);
            entry = entry.next();
        }
        return result;
    }

    protected _toCanonical(value: MappingMap<Value & ICanonicalSource>, logicalTypes: string[]): ICanonical<this> {
        return MapCanonical.from<this>(value, logicalTypes);
    }

    protected _validate(v: MappingMap<Value & ICanonicalSource>, fail: (msg: string) => void): (Value & ICanonicalSource)[] | void {
        // First, validate all slots for proper type and presence.
        const itemClazz = Reflect.getOwnMetadata(ELEM_CLASS, Object.getPrototypeOf(this)) as ValueClassLike;
        if (!itemClazz) {
            throw new Error(`Instance of mapping class '${this.constructor.name}' does not have an item type defined, possibly because no '@mappingvalue()' class decorator is present.`);
        }
        let ok = true;
        const expectedLogicalTypes = toValueClass(itemClazz).logicalTypes;
        for (const [name, value] of v.entries()) {
            // This checks not only checks the proper class types (which may be too strict?), it also catches the case in which
            // the input is not a Value at all (but, for example, a ICanonical).
            if (!(value instanceof itemClazz)) {
                fail(`Value '${name}' with class '${Object.getPrototypeOf(value).constructor.name}' is not an instance of '${itemClazz.name}'`);
                ok = false;
                continue;
            }

            const valueLogicalTypes = value._logicalTypes;

            if (!aExtendsB(valueLogicalTypes, expectedLogicalTypes)) {
                fail(`Value '${name}' with logical types '${valueLogicalTypes.join('.')}' is not compatible with expected logical types '${expectedLogicalTypes.join('.')}'`);
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

    private _checkSlots(): MappingMap<TElem> {
        if (this._slots === undefined) {
            throw new Error(`Not allowed to access unfrozen structure`);
        }
        return this._slots;
    }
}

export function ensureMappingDefForConstructor<TElem extends Value>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor: Function,
    elemClass: Class<TElem> | undefined,
) {
    const prototype = constructor.prototype;
    let itemClazz = Reflect.getOwnMetadata(ELEM_CLASS, prototype) as ValueClassLike;
    
    if (!itemClazz) {
        const parentItemClazz = Reflect.getMetadata(ELEM_CLASS, prototype);
        itemClazz = elemClass ?? parentItemClazz;

        Reflect.defineMetadata(ELEM_CLASS, itemClazz, prototype);
    }
}

export function mappingvalidation<T extends Value & ICanonicalSource>(validator: (value: MappingMap<T>) => string | boolean | void, description?: string) {
    return validation<MappingMap<T>>(validator, description);
}

export function mappingvalue(elemClass: ValueClass, logicalName?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        valueobject(logicalName)(constructor);
        ensureMappingDefForConstructor(constructor, elemClass);
    }
}

mappingvalue(Value, '')(MappingValue);
