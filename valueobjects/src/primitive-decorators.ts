import { ICanonical } from '@darlean/canonical';
import {
    ensureBinaryDefForConstructor,
    ensureBoolDefForConstructor,
    ensureCanonicalDefForConstructor,
    ensureFloatDefForConstructor,
    ensureIntDefForConstructor,
    ensureMomentDefForConstructor,
    ensureStringDefForConstructor,
    PrimitiveValidator
} from './primitive-valueobject';
import { CanonicalType } from './valueobject';

//////////// Generic decorators /////////////

export function stringvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureStringDefForConstructor(constructor, type);
    };
}

export function intvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureIntDefForConstructor(constructor, type);
    };
}

export function floatvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureFloatDefForConstructor(constructor, type);
    };
}
export function boolvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureBoolDefForConstructor(constructor, type);
    };
}
export function momentvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureMomentDefForConstructor(constructor, type);
    };
}

export function binaryvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureBinaryDefForConstructor(constructor, type);
    };
}

export function canonicalvalue(type?: CanonicalType) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureCanonicalDefForConstructor(constructor, type);
    };
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

export function canonicalvalidation(validator: PrimitiveValidator<ICanonical>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureCanonicalDefForConstructor(constructor).withValidator(validator, description);
    };
}
