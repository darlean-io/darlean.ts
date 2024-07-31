import { IValueDef, Value, ValueClass, ValueClassLike } from './valueobject';
import 'reflect-metadata';

const VO_DEF = 'io.darlean.valueobjects.def';

// https://stackoverflow.com/questions/56687668/a-way-to-disable-type-argument-inference-in-generics
// Stop TS from infering the value of T from the provided function arguments.
export type NoInfer<T> = T extends infer U ? U : never;

export function getValueClass<V extends Value>(like: ValueClassLike<V>): ValueClass<V> {
    // eslint-disable-next-line @typescript-eslint/ban-types
    if ((like as Function).prototype) {
        return like as ValueClass<V>;
    }
    return (like as unknown as () => ValueClass<V>)();
}

export function hasDefinitionForClass<T extends ValueClass>(clazz: T | (() => T)): boolean {
    return Reflect.hasOwnMetadata(VO_DEF, getValueClass(clazz));
}

export function getDefinitionForClass<T extends ValueClass>(clazz: T | (() => T)): IValueDef<T> {
    return Reflect.getOwnMetadata(VO_DEF, getValueClass(clazz)) as IValueDef<T>;
}

export function hasDefinitionForValue<T extends Value>(value: T): boolean {
    return Reflect.getOwnMetadata(VO_DEF, value.constructor);
}

export function getDefinitionForValue<T extends ValueClass>(value: InstanceType<T>): IValueDef<T> {
    return Reflect.getOwnMetadata(VO_DEF, value.constructor) as IValueDef<T>;
}

export function setDefinitionForClass<T extends ValueClass>(clazz: T | (() => T), def: IValueDef<T>) {
    Reflect.defineMetadata(VO_DEF, def, getValueClass(clazz));
    return def;
}

export function setDefinitionForValue<T extends ValueClass>(value: InstanceType<T>, def: IValueDef<T>) {
    Reflect.defineMetadata(VO_DEF, def, value.constructor);
    return def;
}

export function valueDefIs(sub: IValueDef, base: IValueDef) {
    const subTypes = sub.types;
    const baseTypes = base.types;

    if (baseTypes.length > subTypes.length) {
        return false;
    }

    for (let idx = 0; idx < baseTypes.length; idx++) {
        if (baseTypes[idx] !== subTypes[idx]) {
            return false;
        }
    }

    return true;
}

export function typesIs(subTypes: string[], baseTypes: string[]) {
    if (baseTypes.length > subTypes.length) {
        return false;
    }

    for (let idx = 0; idx < baseTypes.length; idx++) {
        if (baseTypes[idx] !== subTypes[idx]) {
            return false;
        }
    }

    return true;
}
