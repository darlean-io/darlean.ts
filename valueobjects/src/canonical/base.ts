export type CanonicalBaseType = 'none' | 'bool' | 'int' | 'float' | 'string' | 'moment' | 'binary' | 'sequence' | 'mapping';

/**
 * Represents an object (typically a value object) than can be represented as a canonical value.
 */
export interface ICanonicalSource {
    /**
     * For use by the framework. Returns the internal canonical value. The returned value may not be modified, as that would
     * harm the integrity of the value object. The main purpose for peeking is to be able to serialize the value object.
     */
    _peekCanonicalRepresentation(): ICanonical;
}

export interface ISequenceItem {
    get value(): ICanonical;
    next: () => ISequenceItem | undefined;
}

export interface IMappingItem {
    get key(): string;
    get value(): ICanonical;
    next: () => IMappingItem | undefined;
}

export interface ICanonical {
    get type(): CanonicalBaseType;

    get noneValue(): undefined;
    get boolValue(): boolean;
    get intValue(): number;
    get floatValue(): number;
    get stringValue(): string;
    get momentValue(): Date;
    get binaryValue(): Uint8Array;
    get firstSequenceItem(): ISequenceItem | undefined;
    get firstMappingItem(): IMappingItem | undefined;

    asArray(): ICanonical[];
    asMap(): Map<string, ICanonical>;
    asDict(): {[key: string]: ICanonical};
}

export class BaseCanonical implements ICanonical {
    protected _type: CanonicalBaseType = 'none';

    constructor(type: CanonicalBaseType) {
        this._type = type;
    }

    public get type(): CanonicalBaseType {
        return this._type;
    }

    public get noneValue(): undefined {
        throw new Error(`The canonical value with type "${this._type}" is not a none`);
    }

    public get boolValue(): boolean {
        throw new Error(`The canonical value with type "${this._type}" is not a bool`);
    }

    public get intValue(): number {
        throw new Error(`The canonical value with type "${this._type}" is not an int`);
    }

    public get floatValue(): number {
        throw new Error(`The canonical value with type "${this._type}" is not a float`);
    }

    public get stringValue(): string {
        throw new Error(`The canonical value with type "${this._type}" is not a string`);
    }

    public get momentValue(): Date {
        throw new Error(`The canonical value with type "${this._type}" is not a moment`);
    }

    public get binaryValue(): Uint8Array {
        throw new Error(`The canonical value with type "${this._type}" is not a binary`);
    }

    public get firstSequenceItem(): ISequenceItem | undefined {
        throw new Error(`The canonical value with type "${this._type}" is not a sequence`);
    }

    public get firstMappingItem(): IMappingItem | undefined {
        throw new Error(`The canonical value with type "${this._type}" is not a mapping`);
    }

    public asArray(): ICanonical[] {
        throw new Error(`The canonical value with type "${this._type}" is not a sequence`);
    }
    
    public asMap(): Map<string, ICanonical> {
        throw new Error(`The canonical value with type "${this._type}" is not a mapping`);
    }
    
    public asDict(): {[key: string]: ICanonical} {
        throw new Error(`The canonical value with type "${this._type}" is not a mapping`);
    }
}
