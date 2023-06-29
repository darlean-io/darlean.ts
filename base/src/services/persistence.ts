import { BufferOf } from '@darlean/utils';
import { IActionError } from '../shared';

/**
 * Actor type for the Persistence Service
 */
export const PERSISTENCE_SERVICE = 'io.darlean.PersistenceService';

/**
 * Represents a service that facilitates persistence in the form of storing data, loading data and querying data.
 */
export interface IPersistenceService {
    /**
     * Store a piece of data.
     *
     * @see
     * * {@link IPersistenceStoreOptions} for the options.
     */
    store(options: IPersistenceStoreOptions<Buffer>): Promise<void>;

    /**
     * Stores a batch of data items.
     *
     * When the underlying store supports it, items that have the same partition key are stored atomically (that is, either all of them
     * are stored, or none of them are stored).
     *
     * @returns the list of batch items that were not successfuly processed
     *
     * @see
     * * {@link IPersistenceStoreOptions} for the options.
     */
    storeBatch(options: IPersistenceStoreBatchOptions<Buffer>): Promise<IPersistenceStoreBatchResult>;

    storeBatchBuffer(options: BufferOf<IPersistenceStoreBatchOptions<Buffer>>): Promise<BufferOf<IPersistenceStoreBatchResult>>;

    /**
     * Loads a piece of data.
     *
     * When the item does not exist (anymore), the {@link IPersistenceLoadResult.value} field is `undefined`. Depending on the cleanup policy of
     * the underlying store, the {@link IPersistenceLoadResult.version} is either `undefined`, or set to the version at which the item was deleted.
     */
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult<Buffer>>;

    /**
     * Queries for data items given a set of constraints.
     *
     * @see
     * * {@link IPersistenceQueryOptions} for a description of the options.
     */
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>>;

    /**
     * Queries for data items given a set of constraints.
     *
     * @see
     * * {@link IPersistenceQueryOptions} for a description of the options.
     */
    queryBuffer(options: IPersistenceQueryOptions): Promise<BufferOf<IPersistenceQueryResult<Buffer>>>;
}

/**
 * Options for storing a batch of items.
 */
export interface IPersistenceStoreBatchOptions<T extends Buffer | Blob> {
    /**
     * List of items that should be stored.
     *
     * Items must include an `identifier` field (which can be undefined, and does not have to be unique) that is returned as
     * {@link IUnprocessedItem.identifier} in a {@link IPersistenceStoreBatchResult}.
     */
    items: Array<IPersistenceStoreOptions<T> & { identifier: unknown }>;
}

/**
 * Represents an batch item that could not be processed.
 */
export interface IUnprocessedItem {
    identifier: unknown;
    error: IActionError;
}

/**
 * The result of a store batch operation.
 */
export interface IPersistenceStoreBatchResult {
    /**
     * List of items that could not be processed (and could be retried by the caller).
     */
    unprocessedItems: IUnprocessedItem[];
}

/**
 * Options for storing an item to persistence.
 */
export interface IPersistenceStoreOptions<T extends Buffer | Blob> {
    /**
     * An optional specifier that is used to determine in which compartment the data is to be stored.
     */
    specifier?: string;
    /**
     * The partition key that determines in which partition the item is stored. The combination of partitionKey and sortKey must be uniquely identify an item.
     */
    partitionKey: string[];
    /**
     * The optional sort key that makes it possible to perform efficient queries on items with the same partitionKey.
     */
    sortKey?: string[];
    /**
     * The binary value that needs to be stored.
     *
     * When not present, the item is removed from the store.
     *
     * It is up to the application developer to choose the format, but BSON is the only format that is understood by Darlean itself and for which advanced querying functionality
     * (like projection filters and item filters) is available.
     */
    value?: T;
    /**
     * The mandatory version of the data.
     *
     * Only when the provided version string is lexicographically larger than the version for the current item in the store (if any), the item is stored.
     */
    version: string;
}

/**
 * Options for loading a single item from persistence.
 */
export interface IPersistenceLoadOptions {
    /**
     * An optional specifier that is used to determine from which compartment the data is to be loaded.
     */
    specifier?: string;
    /**
     * The partition key of the item to be loaded. Must be identical to the partition key used for previous storing of the item.
     */
    partitionKey: string[];
    /**
     * The sort key of the item to be loaded. Must be identical to the sort key used for the previous storing of the item.
     */
    sortKey?: string[];
    /**
     * Optional list of fields that should be present in the result object.
     *
     * When present, the value must be encoded as BSON object, and the selected fields are transformed into a new object and encoded as BSON.
     * When not present, the exact (literal) stored value is returned.
     *
     * @See
     * * {@link filterStructure} which is the function that performs the projection filtering.
     */
    projectionFilter?: string[];
    projectionBases?: string[];
}

/**
 * The result of loading an item.
 */
export interface IPersistenceLoadResult<T extends Buffer | Blob> {
    /**
     * The value of the item, or `undefined` when the item was not found.
     *
     * When a projectionFilter is applied, value contains a BSON encoded object with the projection fields.
     */
    value?: T;

    /**
     * The version of the item.
     *
     * That is, the version provided in the last successful store operation. The caller can store the version and use it to derive a
     * new (lexicographically larger) version later on when it wants to update the item via a new store operation.
     */
    version?: string;
}

/**
 * Options for performing a query.
 *
 * # Overview
 *
 * Execution of a query consists of 3 subsequent steps:
 * * *Sort key filtering*. Constraints on the sort key narrow down the result set in a very efficient way. That is possible because the sort keys are
 *     indexed, and only very specific types of constraints (greater-than-equal and less-than-equal) are allowed.
 * * *Item filtering*. The item filter step is applied to all items from the sort key filtering step, and allows more sophisticated filtering, both on keys
 *   fields and on data fields (provided that the data is stored as BSON object).
 * * *Field projection*. Field projection is applied to all items resulting from the item filter step. When field projection is requested, only the indicated
 *   subset of fields is returned.
 *
 * # Sort key filtering
 *
 * Sort key filtering makes it possible to extract a subset of items very efficiently by providing a {@link sortKeyFrom}, {@link sortKeyTo} and/or a {@link sortKeyToMatch}.
 * Darlean uses lexicographical case-sensitive comparisons to determine wheter a sort key is `>= sortKeyFrom` or `<= sortKeyTo`.
 *
 * Example: The following items are listed in lexicographical order: `['', '0', '1', '10', '100', '11', '2', 'A', 'AA', 'B', 'a', 'b' ]`.
 *
 * During sort key filtering, when a node matches with the provided constraints (let's call that node a *base node*), all child node of that base node are automatically
 * included in the result set (recursively -- so also children of children of base nodes are included, et cetera). A child node is a node for which the sort key starts
 * with the sort key of the base node. As an example, when `sortKeyTo = ['T']`, an imaginary item with sort key `['T', 'A']` would also be returned because it is a child of ['T'].
 *
 * # Strict vs loose sort key mode
 *
 * The `sortKeyToMatch` field determines how the last element of the `sortKeyTo` field is matched.
 * * When it is set to `'strict'` (the default), there must be a full-string (exact) match between
 *   the last element of the `sortKeyTo` field and the corresponding field of the sort key of an item.
 * * When it is set to `'loose'`, a prefix-match is performed. So all items for which the corresponding field of
 *   the sort key starts with the last element of `sortKeyTo` are included in the result set.
 *
 * # Examples
 *
 * To illustrate the behaviour of {@link sortKeyFrom}, {@link sortKeyTo} and/or a {@link sortKeyToMatch}, let's consider the following items in the storage:
 * 1. `['A']`
 * 2. `['A', 'B']`
 * 3. `['A', 'C']`
 * 4. `['AA', 'B']`
 * 5. `['B']`
 * 6. `['C', 'C']`
 * 7. `['C', 'C', '']`
 *
 * Here are examples of constraints and which items will be returned:
 * * `sortKeyFrom = ['']` - Returns all items 1-7
 * * `sortKeyFrom = ['A']` - Returns all items 1-7
 * * `sortKeyFrom = ['A', 'B', 'G']` - Returns items 3-7
 * * `sortKeyFrom = ['AAA']` - Returns items 5-7
 * * `sortKeyTo = ['A']`, `sortKeyToMatch = 'strict'` - Returns items 1-3
 * * `sortKeyTo = ['A','B', 'G']`, `sortKeyToMatch = 'strict'` - Returns items 1-2
 * * `sortKeyTo = ['AAA']`, `sortKeyToMatch = 'strict'` - Returns items 1-4
 * * `sortKeyTo = ['C', 'C']`, `sortKeyToMatch = 'strict'` - Returns items 1-7
 * * `sortKeyTo = ['A']`, `sortKeyToMatch = 'loose'` - *Returns items 1-4 (!)*
 * * `sortKeyTo = ['A','B', 'G']`, `sortKeyToMatch = 'loose'` - Returns items 1-2
 * * `sortKeyTo = ['AAA']`, `sortKeyToMatch = 'loose'` - Returns items 1-4
 * * `sortKeyTo = ['C', 'C']`, `sortKeyToMatch = 'loose'` - Returns items 1-7
 */
export interface IPersistenceQueryOptions {
    /**
     * An optional specifier that is used to determine in which compartment the query is to be performed.
     */
    specifier?: string;
    /**
     * The partition key of the items to be queried. This is a mandatory field, and only queries on items with the same partition key are allowed.
     * Data should be organized in such a way that this requirement is met.
     */
    partitionKey: string[];
    /**
     * Smallest value (inclusive) that sort keys that items must have to be returned.
     */
    sortKeyFrom?: string[];
    /**
     * Largest value (inclusive) that sort keys for items must have to be returned. Please see the information under 'Sort key filtering' about returning child items.
     */
    sortKeyTo?: string[];
    /**
     * Indicates whether the last element of sortKeyTo must match exactly (full string match) with the corresponding sort key element of items (`'strict'`, which is the default)
     * or whether a prefix match is sufficient (`'loose'`).
     */
    sortKeyToMatch?: 'strict' | 'loose';
    /**
     * Indicates whether the resulting items are sorted according to ascending order of the sort keys (the default) or in descending order.
     */
    sortKeyOrder?: 'ascending' | 'descending';
    /**
     * When present, only items for which the sort key starts with the `sortKeyPrefix` are returned. See the description of {@link IPersistenceQueryOptions} for more information.
     */
    /**
     * Nested-list structure of filter operations. A list consists of a keyword, followed by zero or more arguments.
     */
    filterExpression?: unknown[];
    /**
     * Optional name of a root element in value that is used as root for finding field values that are part of the filter expression.
     */
    filterFieldBase?: string;
    /**
     * Optional offset that indicates how many leading partition key elements are ignored when deriving the value for a certain partition key field that is part of the filter expression.
     */
    filterPartitionKeyOffset?: number;
    /**
     * Optional offset that indicates how many leading sort key elements are ignored when deriving the value for a certain sort key field that is part of the filter expression.
     */
    filterSortKeyOffset?: number;
    /**
     * An optional projection filter.
     *
     * @See
     * * {@link filterStructure} which is the function that performs the projection filtering.
     */
    projectionFilter?: string[];
    /**
     * When present, limits the result set to the specified number of items.
     *
     * @remarks It is possible for a query to return less than the specified `maxItems`, or even no items at all,
     * even when thare are remaining items present in the store. To determine whether more data is available, use
     * the returned {@link IPersistenceQueryResult.continuationToken}.
     */
    maxItems?: number;
    /**
     * Instructs Darlean to resume a previous query and return the next part of the result set. The token should be the exact same {@link IPersistenceQueryResult.continuationToken} as
     * returned from a previous query. In addition to that, all other fields must be exactly the same as for the original query.
     */
    continuationToken?: string;
}

/**
 * Represents one result item from a query
 */
export interface IQueryItem<T> {
    /**
     * The sort key for the item
     */
    sortKey: string[];

    /**
     * The value for the item.
     *
     * When a projectionFilter is applied, only the projected fields are present as a BSON encoded object.
     */
    value?: T;
}

export interface IPersistenceQueryResult<T> {
    /**
     * When present, indicates that remaning items may be still be available in the store. When not present (`undefined`), indicates
     * that there are no more remaining items.
     *
     * When present, the query can be performed again, providing this `continuationToken`. All other query fields must be exactly equal
     * to the initial query.
     */
    continuationToken?: string;
    /**
     * The result set for the query.
     */
    items: IQueryItem<T>[];
}
