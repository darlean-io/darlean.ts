import { BufferOf } from "@darlean/utils";

/**
 * Actor type for the Tables Service
 */
export const TABLES_SERVICE = 'io.darlean.TablesService';

export interface ITablePutRequest {
    id: string[];
    data?: { [key: string]: unknown };
    specifier?: string;
    version: string;
    baseline?: string;
    indexes: ITableIndexItem[];
}

export const APPLICATION_ERROR_TABLE_ERROR = 'TABLE_ERROR';

export interface ITablePutResponse {
    baseline?: string;
}

export interface ITableGetRequest {
    keys: string[];
    specifier?: string;
    projection?: string[];
    representation?: 'fields' | 'buffer';
}

export interface ITableGetResponse {
    baseline?: string;
    version: string;
    data?: { [key: string]: unknown };
    dataBuffer?: Buffer;
}

export interface ITableItemFilter {
    expression: unknown[];
}

export interface ITableIndexItem {
    name: string;
    keys: string[];
    data?: { [key: string]: unknown };
}

export interface ITableKeyConstraint {
    operator: 'eq' | 'lte' | 'gte' | 'prefix' | 'between' | 'contains' | 'containsni';
    value: string;
    value2?: string;
}

export type TableIndexer = (data?: { [key: string]: unknown }) => ITableIndexItem[];

export interface ITablesService {
    put(request: ITablePutRequest): Promise<ITablePutResponse>;
    get(request: ITableGetRequest): Promise<ITableGetResponse>;
    search(request: ITableSearchRequest): Promise<ITableSearchResponse>;
    searchBuffer(request: ITableSearchRequest): Promise<BufferOf<ITableSearchResponse>>;
}

export interface ITableSearchRequest {
    index?: string;
    keys?: ITableKeyConstraint[];
    keysOrder?: 'ascending' | 'descending';
    filter?: ITableItemFilter;
    specifier?: string;
    tableProjection?: string[];
    indexProjection?: string[];
    continuationToken?: string;
    maxItems?: number;
    tableRepresentation?: 'fields' | 'buffer';
    indexRepresentation?: 'fields' | 'buffer';
}

export interface ITableSearchItem {
    keys?: string[];
    tableFields?: { [key: string]: unknown };
    indexFields?: { [key: string]: unknown };
    tableBuffer?: Buffer;
    indexBuffer?: Buffer;
    id: string[];
}

export interface ITableSearchResponse {
    items: ITableSearchItem[];
    continuationToken?: string;
}
