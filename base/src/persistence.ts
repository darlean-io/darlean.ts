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

export interface IPersistenceQueryOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKeyFrom?: string[];
    sortKeyTo?: string[];
    sortKeyOrder?: 'ascending' | 'descending';
    sortKeyPrefix?: string[];
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
