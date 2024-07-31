import { ensureSequenceDefForConstructor, SequenceValidator } from './sequence-valueobject';
import { Class, Value } from './valueobject';

export function sequencevalidation<TElem extends Value>(validator: SequenceValidator<TElem>, description?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function): void {
        ensureSequenceDefForConstructor<TElem>(constructor, undefined).withValidator(validator, description);
    };
}

export function sequencevalue<TElem extends Value>(elemClass: Class<TElem>, type?: string) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return function (constructor: Function) {
        ensureSequenceDefForConstructor<TElem>(constructor, elemClass, type);
    };
}
