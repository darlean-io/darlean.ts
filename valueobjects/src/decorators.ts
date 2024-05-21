import { IPrimitiveValueClass, PrimitiveValidator, stringv } from './primitive-valueobject';
import { IStructValueClass, NativeStruct, StructValue, structv } from './struct-valueobject';
import { CanonicalFieldName, IValueClass, IValueDef, NativePrimitive, deriveTypeName } from './valueobject';

export function stringvalidation(validator: PrimitiveValidator<string>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        let def = (constructor as unknown as IPrimitiveValueClass<string>).DEF;
        if (def?.template !== constructor) {
            def = (constructor as unknown as IValueClass<unknown>).DEF = stringv(constructor);
        }
        def.withValidator(validator, description);
    };
}

export function required(
    typeDef: IValueDef<NativeStruct | NativePrimitive> | IValueClass<unknown>,
    fieldName?: CanonicalFieldName
) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (prototype: any, name: string, descriptor: PropertyDescriptor): void {
        const constr = prototype.constructor;
        let def = (constr as unknown as IStructValueClass).DEF;
        //console.log('OPT', typeof constructor, typeof Object.getPrototypeOf(constructor), constructor === Object.getPrototypeOf(constructor), constructor, def);
        if (def?.template !== constr) {
            def = (constr as unknown as IValueClass<unknown>).DEF = structv(constr);
        }
        const canonicalName = fieldName ?? deriveTypeName(name);
        def.withRequiredField(canonicalName, typeDef);
        descriptor.get = function () {
            return (this as StructValue)._req(canonicalName);
        };
    };
}

export function optional(
    typeDef: IValueDef<NativeStruct | NativePrimitive> | IValueClass<unknown>,
    fieldName?: CanonicalFieldName
) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (prototype: any, name: string, descriptor: PropertyDescriptor): void {
        const constr = prototype.constructor;
        let def = (constr as unknown as IStructValueClass).DEF;
        //console.log('OPT', typeof constructor, typeof Object.getPrototypeOf(constructor), constructor === Object.getPrototypeOf(constructor), constructor, def);
        if (def?.template !== constr) {
            def = (constr as unknown as IValueClass<unknown>).DEF = structv(constr);
        }
        const canonicalName = fieldName ?? deriveTypeName(name);
        def.withOptionalField(canonicalName, typeDef);
        descriptor.get = function () {
            return (this as StructValue)._opt(canonicalName);
        };
    };
}

export function req<T>(): T {
    console.log('REQ');
    return undefined as unknown as T;
}

export function opt<T>(): T | undefined {
    return undefined;
}
