import { ensureMappingDefForConstructor, MappingValidator } from './mapping-valueobject';
import { Class, Value } from './valueobject';

export function mappingvalidation<TElem extends Value>(validator: MappingValidator<TElem>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureMappingDefForConstructor<TElem>(constructor, undefined).withValidator(validator, description);
    };
}

export function mappingvalue<TElem extends Value>(elemClass: Class<TElem>, type?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureMappingDefForConstructor<TElem>(constructor, elemClass, type);
    };
}
