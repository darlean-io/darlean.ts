export interface IPersistenceService {
    store(options: IPersistenceStoreOptions): Promise<void>;
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult>;
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>>;
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
}

export interface IQueryItem<T> {
    sortKey: string[];
    value?: T;
}

export interface IPersistenceQueryResult<T> {
    continuationToken?: unknown;
    items: IQueryItem<T>[];
}
