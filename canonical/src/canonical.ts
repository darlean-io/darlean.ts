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
    _peekCanonicalRepresentation(): ICanonical<this>;
}

export interface ISequenceItem<TSource extends ICanonicalSource = ICanonicalSource> {
    get value(): CanonicalLike<TSource>;
    next: () => ISequenceItem<TSource> | undefined;
}

export interface IMappingEntry<TSource extends ICanonicalSource = ICanonicalSource> {
    get key(): string;
    get value(): CanonicalLike<TSource>;
    next: () => IMappingEntry<TSource> | undefined;
}

/**
 * ICanonical represents an immutable canonical value with a logical and a physical type. The various
 * getters provide acces to the canonical value.
 * The canonical can represent primitive types (none, bool, int, float, string, moment and binary),
 * a sequences (lists, arrays) or mappings (objects, dictionaries).
 * The values of sequences and mappings are CanonicalLikes, that is, they are either canonicals or
 * other objects of type TSource that implement ICanonicalSource (for example, value objects) than can be converted to a canonical.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ICanonical<TSource extends ICanonicalSource = ICanonicalSource> {
    get physicalType(): CanonicalPhysicalType;
    get logicalTypes(): CanonicalLogicalType[];

    get noneValue(): undefined;
    get boolValue(): boolean;
    get intValue(): number;
    get floatValue(): number;
    get stringValue(): string;
    get momentValue(): Date;
    get binaryValue(): Buffer;
    get firstSequenceItem(): ISequenceItem<TSource> | undefined;
    get firstMappingEntry(): IMappingEntry<TSource> | undefined;

    /**
     * Returns the number of elements (for a sequence) or entries (for a mapping), or undefined when
     * the number of elements is not known or expensive to compute (like for a linked list). Throws an
     * error when invoked on other physical types.
     */
    get size(): number | undefined;

    /**
     * Must return true when the object is a canonical. The presence of this method in combination
     * with a return value of true can be used as a proof that an object is a canonical.
     * Note: An object that implements ICanonicalSource but by itself is not a canonical should
     * must either not implement this method or return false.
     */
    isCanonical(): this is ICanonical<TSource>;

    /**
     * Returns whether this canonical is equal to another canonical. Two canonicals are equal when they have
     * the same logical types, physical types and values. Values are compared "by value"; not "by reference".
     * The order of entries in mappings and structs is not relevant.
     */
    equals(other?: CanonicalLike<TSource>): boolean;

    /**
     * Returns whether the current canonical is a subtype of the provided canonical or list of
     * logical types. A canonical is a subtype of a base when the base logical type array is empty,
     * or when all base logical type elements match with the current canonical logical type elements.
     */
    is(base: CanonicalLike<TSource> | CanonicalLogicalTypes): boolean;

    /**
     * Returns the value for the specified key when this canonical represents a mapping, Returns undefined when
     * the key is not present. Throws an error when the canonical is not a mapping.
     */
    getMappingValue(key: string): CanonicalLike<TSource> | undefined;

    /**
     * Returns the value for the specified index when this canonical represents a sequence. Returns undefined when
     * the index is out of bounds. Throws an error when the canonical is not a sequence.
     */
    getSequenceItem(index: number): CanonicalLike<TSource> | undefined;
}

export type CanonicalLike<TSource extends ICanonicalSource = ICanonicalSource> = ICanonical<TSource> | ICanonicalSource;
