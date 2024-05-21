export type CanonicalPhysicalType = 'none' | 'bool' | 'int' | 'float' | 'string' | 'moment' | 'binary' | 'sequence' | 'mapping';
export type CanonicalLogicalType = string;
// Most generic type first
export type CanonicalLogicalTypes = CanonicalLogicalType[];

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

export interface IMappingEntry {
    get key(): string;
    get value(): ICanonical;
    next: () => IMappingEntry | undefined;
}

/**
 * ICanonicaL represents an immutable canonical value with a logical and a physical type. The various
 * getters provide acces to the canonical value.
 */
export interface ICanonical {
    get physicalType(): CanonicalPhysicalType;
    get logicalTypes(): CanonicalLogicalType[];

    get noneValue(): undefined;
    get boolValue(): boolean;
    get intValue(): number;
    get floatValue(): number;
    get stringValue(): string;
    get momentValue(): Date;
    get binaryValue(): Buffer;
    get firstSequenceItem(): ISequenceItem | undefined;
    get firstMappingEntry(): IMappingEntry | undefined;

    asArray(): ICanonical[];
    asMap(): Map<string, ICanonical>;
    asDict(): { [key: string]: ICanonical };
}
