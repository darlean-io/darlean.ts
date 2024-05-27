import { arrayv } from './array-valueobject';
import {
    IPrimitiveValueClass,
    PrimitiveValidator,
    binaryv,
    boolv,
    floatv,
    intv,
    momentv,
    stringv
} from './primitive-valueobject';
import { StructDef, StructValue, structv } from './struct-valueobject';
import { IValueClass, NativeType, ValueDefLike, deriveTypeName } from './valueobject';

//////////// Generic decorators /////////////

// eslint-disable-next-line @typescript-eslint/ban-types
export function stringvalue(constructor: Function) {
    ensureStringDefForConstructor(constructor);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function intvalue(constructor: Function) {
    ensureIntDefForConstructor(constructor);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function floatvalue(constructor: Function) {
    ensureFloatDefForConstructor(constructor);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function boolvalue(constructor: Function) {
    ensureBoolDefForConstructor(constructor);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function momentvalue(constructor: Function) {
    ensureMomentDefForConstructor(constructor);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function binaryvalue(constructor: Function) {
    ensureBinaryDefForConstructor(constructor);
}

/////////// Validation decorators //////////////////

export function stringvalidation(validator: PrimitiveValidator<string>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureStringDefForConstructor(constructor).withValidator(validator, description);
    };
}

export function intvalidation(validator: PrimitiveValidator<number>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureIntDefForConstructor(constructor).withValidator(validator, description);
    };
}

export function floatvalidation(validator: PrimitiveValidator<number>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureFloatDefForConstructor(constructor).withValidator(validator, description);
    };
}

export function boolvalidation(validator: PrimitiveValidator<boolean>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureBoolDefForConstructor(constructor).withValidator(validator, description);
    };
}

export function momentvalidation(validator: PrimitiveValidator<Date>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureMomentDefForConstructor(constructor).withValidator(validator, description);
    };
}

export function binaryvalidation(validator: PrimitiveValidator<Buffer>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureBinaryDefForConstructor(constructor).withValidator(validator, description);
    };
}

////////////// Helpers ////////////////

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureStringDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<string>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<string>).DEF = stringv(constructor);
    }
    return def;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureIntDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<number>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<number>).DEF = intv(constructor);
    }
    return def;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureFloatDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<number>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<number>).DEF = floatv(constructor);
    }
    return def;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureBoolDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<boolean>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<boolean>).DEF = boolv(constructor);
    }
    return def;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureMomentDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<Date>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<Date>).DEF = momentv(constructor);
    }
    return def;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function ensureBinaryDefForConstructor(constructor: Function) {
    let def = (constructor as unknown as IPrimitiveValueClass<Buffer>).DEF;
    if (def?.template !== constructor) {
        def = (constructor as unknown as IValueClass<Buffer>).DEF = binaryv(constructor);
    }
    return def;
}

/////////////////// Arrays //////////////

export function typedarrayvalue(elementTypeDef: ValueDefLike<NativeType>) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constr: Function): void {
        let def = (constr as unknown as IValueClass<NativeType>).DEF;
        if (def?.template !== constr) {
            def = (constr as unknown as IValueClass<NativeType>).DEF = arrayv(constr, undefined, elementTypeDef);
        }
    };
}

export function untypedarrayvalue() {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constr: Function): void {
        let def = (constr as unknown as IValueClass<NativeType>).DEF;
        if (def?.template !== constr) {
            def = (constr as unknown as IValueClass<NativeType>).DEF = arrayv(constr, undefined, undefined);
        }
    };
}

////////////////// Structs /////////////////////

/**
 * Obgligatory decorator for TS struct values.
 *
 * @example
 * Defining a struct value with a required, optional and derived field:
 * ```
 *   @structvalue()
 *   class Person extends StructValue {
 *     get firstName() { return FirstName.required(); }                              // Required field
 *     get lastName() { return LastName.optional(); }                                // Optional field
 *     get fullName() { return this.firstName.value + ' ' + this.lastName?.value}    // Derived/calculated field
 *   }
 * ```
 */
export function objectvalue(options?: { extensions: 'keep' | 'error' | 'ignore' }) {
    return structvalue({ extensions: options?.extensions ?? 'error' });
}

export function mapvalue() {
    return structvalue({ extensions: 'keep' });
}

function structvalue(options?: { extensions: 'keep' | 'error' | 'ignore' }) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constr: Function): void {
        let def = (constr as unknown as IValueClass<NativeType>).DEF as StructDef;
        //console.log('OPT', typeof constructor, typeof Object.getPrototypeOf(constructor), constructor === Object.getPrototypeOf(constructor), constructor, def);
        if (def?.template !== constr) {
            def = (constr as unknown as IValueClass<NativeType>).DEF = structv(constr);
        }

        if (options?.extensions) {
            def = def.withExtensions(options.extensions);
        }

        const prototype = constr.prototype;
        for (const name of Object.getOwnPropertyNames(prototype)) {
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
                def.withRequiredField(canonicalName, info.clazz as unknown as IValueClass<NativeType>);
            } else {
                def.withOptionalField(canonicalName, info.clazz as unknown as IValueClass<NativeType>);
            }
            const required = info.required;
            descriptor.get = function () {
                return required ? (this as StructValue)._req(canonicalName) : (this as StructValue)._opt(canonicalName);
            };
            Object.defineProperty(prototype, name, descriptor);
        }
    };
}
