import { ArrayCanonical, ICanonical, ICanonicalSource } from '@darlean/canonical';
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
    extractValueDef
} from './valueobject';

export interface IArrayValueClass<TNative extends NativeType> {
    DEF: ArrayDef<TNative>;
}

export class ArrayDef<TNative extends NativeType> implements IValueDef<NativeArray> {
    private _types: CanonicalType[];
    // eslint-disable-next-line @typescript-eslint/ban-types
    private _template: Function;
    private _elementTypeDef?: ValueDefLike<TNative>;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(template: Function, type?: CanonicalType, elementTypeDef?: ValueDefLike<TNative>) {
        this._template = template;
        this._types = [type ?? deriveTypeName(template.name)];

        this._elementTypeDef = elementTypeDef;

        const proto = Object.getPrototypeOf(template);
        if (proto) {
            this.withBase(proto);
        }
    }

    public get types() {
        return this._types;
    }

    public get elementTypeDef() {
        return this._elementTypeDef;
    }

    public withBase(base: IArrayValueClass<TNative> | ArrayDef<TNative>): ArrayDef<TNative> {
        const base2 = base instanceof ArrayDef ? base : base.DEF;
        if (!base2) {
            return this;
        }

        this._types = [...base2.types, ...this._types];
        //this._validators = [...base2._validators, ...this._validators];
        return this;
    }

    get template() {
        return this._template;
    }

    public construct(value: ICanonical | NativeArray): IValueObject {
        return Reflect.construct(this._template, [value]);
    }

    public hasType(type: CanonicalType) {
        return this._types.includes(type);
    }

    public from(value: ICanonical | NativeArray): IValueObject {
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

export class ArrayValue<TNative extends NativeType> implements IValueObject, ICanonicalSource<TNative> {
    static DEF = array(ArrayValue, undefined);

    private _items?: (IValueObject | ICanonical)[];

    static required<U extends NativeType, T extends typeof ArrayValue<U>>(this: T): InstanceType<T> {
        return { required: true, clazz: this } as unknown as InstanceType<T>;
    }

    static optional<U extends NativeType, T extends typeof ArrayValue<U>>(this: T): InstanceType<T> | undefined {
        return { required: false, clazz: this } as unknown as InstanceType<T>;
    }

    static from<U extends NativeType, T extends typeof ArrayValue<U>>(this: T, value: unknown[]): InstanceType<T> {
        return (this as unknown as IValueClass<NativeType>).DEF.from(value) as InstanceType<T>;
    }

    constructor(value: ICanonical | NativeArray) {
        const proto = this.constructor as unknown as IArrayValueClass<TNative>;
        this._items = validateArray(proto.DEF, value);
    }

    get length() {
        return this._checkItems().length;
    }

    // TODO typing this.
    public get(idx: number) {
        return this._checkItems()[idx];
    }

    public getTyped(idx: number) {
        return this._checkItems()[idx] as TNative;
    }

    public _peekCanonicalRepresentation(): ICanonical {
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

    private _checkItems(): (IValueObject | ICanonical)[] {
        if (this._items === undefined) {
            throw new Error(`Not allowed to access unfrozen array`);
        }
        return this._items;
    }
}

function validateArray<TNative extends NativeType>(
    def: ArrayDef<TNative>,
    input: ICanonical | NativeArray
): (IValueObject | ICanonical)[] {
    const items: (IValueObject | ICanonical)[] = [];

    function addValue(value: ICanonical | IValueObject) {
        if (def.elementTypeDef) {
            const extractedDef = extractValueDef(def.elementTypeDef);
            const instance = extractedDef.from(value);
            items.push(instance);
        } else {
            items.push(value);
        }
    }

    if ((input as ICanonical).firstSequenceItem) {
        let item = (input as ICanonical).firstSequenceItem;
        while (item) {
            const value = item.value;
            addValue(value);
            item = item.next();
        }
    } else {
        for (const value of input as NativeArray) {
            addValue(value);
        }
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
