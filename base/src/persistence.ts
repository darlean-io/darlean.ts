import { IActionError } from './shared';

export interface IPersistenceService {
    store(options: IPersistenceStoreOptions): Promise<void>;
    storeBatch(options: IPersistenceStoreBatchOptions): Promise<IPersistenceStoreBatchResult>;
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult>;
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>>;
}

export interface IPersistenceStoreBatchOptions {
    items: Array<IPersistenceStoreOptions & { identifier: unknown }>;
}

export interface IUnprocessedItem {
    identifier: unknown;
    error: IActionError;
}

export interface IPersistenceStoreBatchResult {
    unprocessedItems: IUnprocessedItem[];
}

export interface IPersistenceStoreOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKey?: string[];
    value?: Buffer;
    version?: string;
}

export interface IPersistenceLoadOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKey?: string[];
    projectionFilter?: string[];
}

export interface IPersistenceLoadResult {
    value?: Buffer;
    version?: string;
}

/**
 * Defines the options for performing a query.
 *
 * # Notes about sorting
 *
 * Records form a tree based on their sort key. Assume we have the following records, sorted lexicographically:
 * 1. `['A']`
 * 2. `['A', 'B']`
 * 3. `['A', 'C']`
 * 4. `['AA', 'B']`
 * 5. `['B']`
 * 6. `['C', 'C']`
 * 7. `['C', 'C', '']`
 *
 * On a functional level, these records form the following tree structure:
 * * 'A'
 *   * 'B'
 *   * 'C'
 * * 'AA'
 * * 'B'
 * * 'C'
 *   * 'C'
 *     * ''
 *
 * Selection can be performed via `sortKeyFrom` and `sortKeyTo`.
 *
 * ## Sort key from
 * When a `sortKeyFrom` is provided, only records are included in the result set that are at the same position or lower in the sorted tree structure than
 * where the fictive record for the `sortKeyFrom` constraint would be.
 *
 * Examples:
 * * `sortKeyFrom = ['']` - Returns all items 1-7
 * * `sortKeyFrom = ['A']` - Returns all items 1-7
 * * `sortKeyFrom = ['A', 'B', 'G']` - Returns items 3-7
 * * `sortKeyFrom = ['AAA']` - Returns items 5-7
 *
 * ## Sort key to in strict mode
 * When a `sortKeyTo` is provided, only records are included in the result set that are at the same position or higher in the sorted tree structure than
 * where the fictive record for the `sortKeyTo` constraint would be. In strict mode, there must be an exact match between all fields in the constraint and
 * the corresponding field in the sortKey of the records.
 *
 * Note: All child records are included as well. For example, `sortKeyTo = ['A']` would normally only return item 1, but not its children. Because the records
 * are functionally considered to form a tree, it makes sense to also include the children of this node. That is why a query for `sortKeyTo = ['A]` returns
 * all records 1-3.
 *
 * Examples:
 * * `sortKeyTo = ['A']` - Returns items 1-3
 * * `sortKeyTo = ['A','B', 'G']` - Returns items 1-2
 * * `sortKeyTo = ['AAA'] - Returns items 1-4
 * * `sortKeyTo = ['C', 'C'] - Returns items 1-7
 *
 * ## Sort key to in loose mode
 * When a `sortKeyTo` is provided, only records are included in the result set that are at the same position or higher in the sorted tree structure than
 * where the fictive record for the `sortKeyTo` constraint would be. In loose mode, there must be a prefix match between all fields in the constraint and
 * the corresponding field in the sortKey of the records.
 *
 * Note: All child records are included as well. For example, `sortKeyTo = ['A']` would normally only return item 1, but not its children. Because the records
 * are functionally considered to form a tree, it makes sense to also include the children of this node. That is why a query for `sortKeyTo = ['A]` returns
 * all records 1-3.
 *
 * Examples:
 * * `sortKeyTo = ['A']` - Returns items 1-4
 * * `sortKeyTo = ['A','B', 'G']` - Returns items 1-2
 * * `sortKeyTo = ['AAA'] - Returns items 1-4
 * * `sortKeyTo = ['C', 'C'] - Returns items 1-7
 *
 * ## Sort key prefix
 * *NOT SUPPORTED ANYMORE*
 *
 * When a 'sortKeyPrefix' constraint is provided, it depends on the last constraint element (we call that the *tail*) how the prefix match is performed.
 *
 * When the last constraint element is an empty string (`''`), like in `sortKeyPrefix = ['A', '']`, item `['A']` itself and all items under `['A']` are included
 * (so items 1-3 would be returned).
 *
 * When the last constraint element is not an empty string, like in `sortKeyPrefix = ['A']`, all items
 * Records can have a sort key which can consist of multiple parts. During search, a sortKeyFrom, sortKeyTo and sortKeyPrefix
 * can be provided.
 *
 * They operate on the lexicographical representation of the sort key, where the sort key fields are joined together, separated
 * by a separator. On a functional level, the separator has the (fictional) unicode value -1. That is, it is smaller than all of
 * the unicode characters that can be present in the key fields. (Implementation may implement this differently, as long as the
 * functionality does not change).
 *
 * Example: the sort key `['A', 'B']` is functionally represented as `[65, -1, 66]`.
 *
 * Comparison is performed on this functional representation where the numeric values are compared left-to-right like is the case in
 * regular lexigraphical ordering.
 *
 * As an illustration, the following keys are listed here in ascending order of their functional representation:
 * 1. `['A']` with functional representation `[65]`
 * 2. `['A', 'B']` with functional representation `[65, -1, 66]`
 * 3. `['A', 'C']` with functional representation `[65, -1, 67]`
 * 4. `['AA', 'B']` with functional representation `[65, 65, -1, 66]`
 * 5. `['B']` with functional representation `[66]`
 * 6. `['C', 'C']` with functional representation `[66, -1, 66]`
 * 7. `['C', 'C', '']` with functional representation `[66, -1, 66, -1]`
 *
 * The consequence for querying is as follows:
 * * The `sortKeyFrom` field is converted to the corresponding functional representation and then 'lexicographically' matched with the functional representations of the stored keys.
 *   In particular, `sortKeyFrom = ['A', 'C']` will include item 3, but also item 4 (because `[65, 65] >= [65, -1]) and all other items 5-7.
 * * The `sortKeyTo` field is converted to the corresponding functional representation and then 'lexicographically' matched with the functional representations of the stored keys (in
 *   an inclusive way). In addition to that, all 'children' of these matched keys (that may in fact have a larger functional representation than `sortKeyTo`, so should normally be excluded)
 *   are included. So, `sortKeyTo = ['A', 'C']` will include items 1-3, but not items 4-7. And, `sortKeyTo = ['A']` not only includes item 1 but
 *   also items 2 and 3 that have a larger functional representation than `sortKeyTo`, but are nevertheless included because they 'belong to a'.
 * * The `sortKeyPrefix` field is converted to the corresponding functional representation and then compared with the functional representations of the stored keys. Keys that
 *   have the functional representation as an exact prefix are returned. So, `sortKeyPrefix = ['A']` returns items 1-4 (including item 4 which starts with `'AA'`).
 *   To only return items 2 and 3 that are child items of exactly `'A'`, use `sortkeyPrefix = ['A', '']. To return all items 1-3 that start with exactly `'A'`
 *   (including item 1 which does nt have children), use `sortKeyFrom = ['A']` together with `sortKeyTo = ['A', '\u{10FFFF}'].
 */
export interface IPersistenceQueryOptions {
    specifiers?: string[];
    /**
     * Exact match for the partition key. Only items for which the partition keys match exactly with the provided `partitionKey` are returned.
     */
    partitionKey: string[];
    /**
     * Smallest value (inclusive) that returned sort keys must have. See the description of {@link IPersistenceQueryOptions} for more information.
     */
    sortKeyFrom?: string[];
    /**
     * Largest value (inclusive) that returned sort keys must have. See the description of {@link IPersistenceQueryOptions} for more information.
     */
    sortKeyTo?: string[];
    sortKeyToMatch?: 'strict' | 'loose';
    sortKeyOrder?: 'ascending' | 'descending';
    /**
     * When present, only items for which the sort key starts with the `sortKeyPrefix` are returned. See the description of {@link IPersistenceQueryOptions} for more information.
     */
    // sortKeyPrefix?: string[];
    maxItems?: number;
    continuationToken?: unknown;
    filterExpression?: unknown[];
    filterFieldBase?: string;
    filterPartitionKeyOffset?: number;
    filterSortKeyOffset?: number;
    projectionFilter?: string[];
}

export interface IQueryItem<T> {
    sortKey: string[];
    value?: T;
}

export interface IPersistenceQueryResult<T> {
    continuationToken?: unknown;
    items: IQueryItem<T>[];
}
