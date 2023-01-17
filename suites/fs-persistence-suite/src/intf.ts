export interface IFsPersistenceService {
    store(options: IPersistenceStoreOptions): Promise<void>;
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult>;
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult>;
}

export interface IPersistenceStoreOptions {
    partitionKey: string[];
    sortKey?: string[];
    value?: Buffer;
}

export interface IPersistenceLoadOptions {
    partitionKey: string[];
    sortKey?: string[];
}

export interface IPersistenceLoadResult {
    value?: Buffer;
}

export interface IPersistenceQueryOptions {
    partitionKey: string[];
    sortKey?: string[];
    sortKeyOperator?: 'equals' | 'starts-with' | 'less-than' | 'less-than-equal' | 'greater-than' | 'greater-than-equal';
    sortKeyOrder?: 'ascending' | 'descending';
    maxItems?: number;
    continuationToken?: unknown;
}

export interface IQueryItem {
    sortKey: string[];
    value?: Buffer;
}

export interface IPersistenceQueryResult {
    continuationToken?: unknown;
    items: IQueryItem[];
}
