import { ICanonical, ICanonicalSource } from "../canonical/base";
import { MapCanonical } from "../canonical/mappings";
import { IValueDef, IValueObject, CanonicalType, CanonicalFieldName, NativePrimitive, getValueObjectDef, isValueObject, IValueClass, deriveTypeName } from "./valueobject";

export type UnknownFieldAction = 'keep' | 'ignore' | 'error';

export interface IStructValueClass {
    DEF: StructDef;
}

export interface ISlotDef<TNative> {
    name: string;
    required: boolean;
    def: IValueDef<TNative>;
    propName?: string;
}

export type NativeStruct = {[key: string]: ICanonical | IValueObject} | Map<string, ICanonical | IValueObject>;

export class StructDef implements IValueDef<NativeStruct> {
  private _types: CanonicalType[];
  private _slots: Map<string, ISlotDef<unknown>>;
  private _requiredSlots: string[];
  private _unknownFieldAction: UnknownFieldAction = 'keep';
  // eslint-disable-next-line @typescript-eslint/ban-types
  private _template: Function;
  private _strictFieldNames: boolean;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(template: Function, type?: CanonicalType, strictFieldNames = false) {
    this._template = template;
    this._types = [type ?? deriveTypeName(template.name)];
    this._slots = new Map();
    this._requiredSlots = [];
    this._strictFieldNames = strictFieldNames;
    
    const proto = Object.getPrototypeOf(template);
    if (proto) {
      this.withBase(proto);
    }
  }

  public get types() { return this._types; }

  public withBase(base: IStructValueClass | StructDef): StructDef {
    const base2 = (base instanceof StructDef) ? base : base.DEF;
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

  public withRequiredField(name: CanonicalFieldName, def: IValueDef<NativeStruct | NativePrimitive> | IValueClass<unknown>, propName?: string): StructDef {
    if (this._strictFieldNames) {
        validateStrictFieldName(name);
    }
    const def2 = (def as IValueClass<unknown>)?.DEF ?? def;
    this._slots.set(name, { name, required: true, def: def2, propName });
    this._requiredSlots.push(name);
    return this;
  }

  public withOptionalField(name: CanonicalFieldName, def: IValueDef<NativeStruct | NativePrimitive> | IValueClass<unknown>,propName?: string): StructDef {
    if (this._strictFieldNames) {
        validateStrictFieldName(name);
    }
    const def2 = (def as IValueClass<unknown>)?.DEF ?? def;
    this._slots.set(name, { name, required: false, def: def2, propName });
    return this;
  }

  public withExtensions(action: UnknownFieldAction): StructDef {
    this._unknownFieldAction = action;
    return this;
  }

  public getSlotDef<T>(name: string): ISlotDef<T> | undefined {
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

  public getSlots(): IterableIterator<ISlotDef<unknown>> {
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

  public construct(value:ICanonical): IValueObject {
    return Reflect.construct(this._template, [value]);
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
        } else
        if (ourType) {
            throw new Error(`Value object is not compatible with ${ourType}`);
        }
    }
    return this.construct(value as ICanonical)
  }
}

export class StructValue implements IValueObject, ICanonicalSource {
    static DEF = struct(StructValue, undefined);

    private _slots?: Map<string, IValueObject | ICanonical>;

    static required<T extends typeof StructValue>(this: T): InstanceType<T> {
        return undefined as unknown as InstanceType<T>; 
    }

    static optional<T extends typeof StructValue>(this: T): InstanceType<T> | undefined {
        return undefined; 
    }

    static from<T extends typeof StructValue>(this: T, value: Partial<InstanceType<T>>): InstanceType<T> {
        const v2: {[key: string]: unknown} = {};
        for (const [k, v] of Object.entries(value)) {
            v2[deriveTypeName(k)] = v;
        }
        return (this as unknown as IValueClass<unknown>).DEF.from(v2) as InstanceType<T>;
    }


    constructor(value: ICanonical | NativeStruct) {
        const proto = (this.constructor as unknown as IStructValueClass);
        this._slots = validateStruct(proto.DEF, value, this);
    }

    public _peekCanonicalRepresentation(): ICanonical {
        const slots = this._checkSlots();
        return new MapCanonical(slots as unknown as Map<string, ICanonical | ICanonicalSource>, (Object.getPrototypeOf(this).constructor as IStructValueClass).DEF.types);
    }

    public extractSlots(): Map<string, ICanonical | IValueObject> {
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

function validateStruct(def: StructDef, input: ICanonical | NativeStruct, target: unknown): Map<string, IValueObject | ICanonical> {
    const slots = new Map<string, IValueObject | ICanonical>();

    function addValue(key: string, value: ICanonical | IValueObject) {
        if (def.strictFieldNames) {
            validateStrictFieldName(key);
        }
        
        const slotDef = def.getSlotDef(key);
        if (slotDef) {
            const instance = slotDef.def.from(value);
            slots.set(key, instance);
            //if (slotDef.propName && target) {
                //console.log('SETTING', target, slotDef.propName);
                //Reflect.set(target, slotDef.propName, instance);
                //console.log('SET', target, (target as any).firstName);
            //}
        } else {
            switch (def.unknownFieldAction) {
                case 'keep': slots.set(key, value); break;
                case 'error': throw new Error(`Unexpected field "${key}"`);
            }
        }
    }

    if ((input as ICanonical).firstMappingItem) {
        let item = (input as ICanonical).firstMappingItem;
        while (item) {
            const key = item.key;
            const value = item.value;
            addValue(key, value);
            item = item.next();
        }
    } else {
        const slotIterator = (input instanceof Map) ? input.entries() : Object.entries(input);
        for (const [key, value] of slotIterator) {
            addValue(key, value);
        }
    }

    for (const slot of def.getRequiredSlots()) {
        if (!slots.has(slot)) {
            throw new Error(`Required field "${slot}" is missing`);
        }
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
        const ok = (
            (char >= '0') && (char <= '9')) ||
            ((char >= 'a') && (char <= 'z')) ||
            (char === '-');
        if (!ok) {
            throw new Error(`Field name "${name}" contains illegal characters (allowed are a-z, 9-0 and -)`);
        }
    }
}

export const structv = struct;

// eslint-disable-next-line @typescript-eslint/ban-types
export function objectv(template: Function, type: CanonicalType): StructDef {
    const def = new StructDef(template, type, true).withExtensions('error');
    (template as unknown as IStructValueClass).DEF = def;
    return def;
} 
