/* eslint-disable @typescript-eslint/ban-types */
import { IInstanceWrapper } from './instances';
import { IPersistenceQueryOptions, IPersistenceQueryResult } from './persistence';

/**
 * Represents a persistable value.
 */
export interface IPersistable<T> {
    /**
     * The current value as the application knows it.
     */
    value?: T;
    /**
     * The version reported for the last load action.
     */
    version?: string;
    /**
     * Change value and mark the value as being changed.
     * @param value The new value (optional). When not present, the old value is not adjusted.
     */
    change(value?: T): void;
    /**
     * Make value undefined and mark it as being changed.
     */
    clear(): void;
    /**
     * Returns whether the value was changed locally
     */
    changed(): boolean;
    /**
     * Loads the value from the underlying persistence store.
     * @returns The loaded value
     * @Remarks When the store does not return a value, `load` returns `undefined`, but the value of
     * {@link IPersistable.value} is not adjusted (still has the old value). This makes it easy to
     * provide an {@link IPersistable} with a default initial value, then call {@link load}, and when
     * no data was yet present in the store, the earlier assigned default value is still present.
     */
    load(): Promise<T | undefined>;

    /**
     * Stores the value in the unerlying persistence store.
     * @param force When `true`, also perform the store when the value is not {@link changed}. Default value
     * is `false`.
     */
    store(force?: boolean): Promise<void>;
}

/**
 * Interface to persistent storage that can be used to load and store values persistently.
 */
export interface IPersistence<T> {
    /**
     * Returns a new {@link IPersistable} instance with the provided partition key, sort key and
     * initial value.
     * @param partitionKey The partition key that will be used for later load and store actions
     * @param sortKey The sort key that will be used for later load and store actions
     * @param value The initial value that is assigned to {@IPersistable.value}.
     * @remarks This method just returns a new {@link IPersistence} with an optional default value set; it does
     * *not* perform and {@link load}ing of the data from the persistence store. For that, use {@link load}.
     */
    persistable(partitionKey?: string[], sortKey?: string[], value?: T): IPersistable<T>;

    /**
     * Creates a new {@link Ipersistable} instance with the provided partition and sort key, and
     * loads the most recent value from the persistence store.
     * @param partitionKey The partition key that will be used for this and later load and store actions
     * @param sortKey The sort key that will be used for this and later load and store actions
     */
    load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>>;

    /**
     * Returns a new sub-persistence interface with the provided partition key and sort key added
     * to the partition and sort key of the current instance.
     * @param partitionKey The partition key fields that will be added to the existing partition key fields.
     * Must be `undefined` or `[]` when the current instance already has a sort key assigned.
     */
    sub(partitionKey?: string[]): IPersistence<T>;

    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>>;
}

export interface IVolatileTimerHandle {
    cancel(): void;
    pause(duration?: number): void;
    resume(delay?: number): void;
}

export type VolatileTimerFactory<T extends object> = (wrapper: IInstanceWrapper<T>) => IVolatileTimer;

export interface IVolatileTimer {
    once(handler: Function, delay: number, args?: unknown): IVolatileTimerHandle;
    repeat(handler: Function, interval: number, delay?: number, nrRepeats?: number, args?: unknown): IVolatileTimerHandle;
}

export interface ITablePutRequest {
    id: string[];
    data?: { [key: string]: unknown };
    specifier?: string;
    version: string;
    baseline?: string;
    indexes: IIndexItem[];
}

export const APPLICATION_ERROR_TABLE_ERROR = 'TABLE_ERROR';

export interface ITablePutResponse {
    baseline?: string;
}

export interface ITableGetRequest {
    keys: string[];
    specifier?: string;
    projection?: string[];
}

export interface ITableGetResponse {
    baseline?: string;
    version: string;
    data?: { [key: string]: unknown };
}

export interface IFilter {
    expression: unknown[];
}

export interface IIndexItem {
    name: string;
    keys: string[];
    data?: { [key: string]: unknown };
}

export interface IKeyConstraint {
    operator: 'eq' | 'lte' | 'gte' | 'prefix' | 'between' | 'contains' | 'containsni';
    value: string;
    value2?: string;
}

export type Indexer = (data?: { [key: string]: unknown }) => IIndexItem[];

export interface ITableService {
    put(request: ITablePutRequest): Promise<ITablePutResponse>;
    get(request: ITableGetRequest): Promise<ITableGetResponse>;
    search(request: ITableSearchRequest): Promise<ITableSearchResponse>;
}

export interface ITableSearchRequest {
    index?: string;
    keys?: IKeyConstraint[];
    keysOrder?: 'ascending' | 'descending';
    filter?: IFilter;
    specifier?: string;
    tableProjection?: string[];
    indexProjection?: string[];
    continuationToken?: string;
    maxItems?: number;
}

export interface ITableSearchItem {
    keys?: string[];
    tableFields?: { [key: string]: unknown };
    indexFields?: { [key: string]: unknown };
    id: string[];
}

export interface ITableSearchResponse {
    items: ITableSearchItem[];
    continuationToken?: string;
}

export interface ITablePersistence<T> {
    search(options: ITableSearchRequest): Promise<ITableSearchResponse>;
    searchChunks(options: ITableSearchRequest): AsyncGenerator<ITableSearchResponse, void>;
    searchItems(options: ITableSearchRequest): AsyncGenerator<ITableSearchItem, void>;
    persistable(key: string[], value: T | undefined): IPersistable<T>;
    load(key: string[]): Promise<IPersistable<T>>;
}
