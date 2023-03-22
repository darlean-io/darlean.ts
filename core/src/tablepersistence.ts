import { IPersistable, IPersistence, IPersistenceQueryOptions, IPersistenceQueryResult } from '@darlean/base';
import {
    IIndexItem,
    IKeyConstraint,
    ITablePutResponse,
    ITableSearchRequest,
    ITableSearchResponse,
    ITableService
} from '@darlean/tables-suite';
import { SubPersistence } from './various';

/**
 * For internal use. Helper class for {@link TablePersistence}.
 */
class TablePersistable<T> implements IPersistable<T> {
    private _changed = false;
    private persistence: TablePersistence<T>;
    private partitionKey: string[] | undefined;
    private sortKey: string[] | undefined;
    private baseline?: string;

    public value?: T | undefined;
    public version?: string | undefined;

    constructor(
        persistence: TablePersistence<T>,
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined
    ) {
        this.persistence = persistence;
        this.partitionKey = partitionKey;
        this.sortKey = sortKey;
        this.value = value;
    }

    public async load(): Promise<T | undefined> {
        const result = await this.persistence.loadImpl(this.partitionKey, this.sortKey);
        if (result[0] !== undefined) {
            this.value = result[0];
        }
        this.version = result[1];
        this.baseline = result[2];
        this._changed = false;
        return result[0];
    }

    public async store(force?: boolean): Promise<void> {
        if (!force) {
            if (!this._changed) {
                return;
            }
        }

        let version = this.version;
        if (version) {
            const next = parseInt(this.version || '0') + 1;
            version = next.toString().padStart(20, '0');
            this.version = version;
        } else {
            const next = Date.now();
            version = next.toString().padStart(20, '0');
            this.version = version;
        }
        await this.persistence.storeImpl(this.partitionKey, this.sortKey, this.value, version, this.baseline);
        this._changed = false;
    }

    public change(value: T | undefined): void {
        if (value !== undefined) {
            this.value = value;
        }
        this._changed = true;
    }

    public clear(): void {
        this.value = undefined;
        this._changed = true;
    }

    changed(): boolean {
        return this._changed;
    }
}

export interface ITablePersistenceSearchRequest {
    partitionKey?: string[];
}

export interface ITablePersistenceSearchResponse {
    partitionKey?: string[];
    sortKey?: string[];
}

/**
 * Implementation of {@link IPersistence} that uses a table as persistence.
 */
export class TablePersistence<T> implements IPersistence<T> {
    private service: ITableService;
    private specifier: string | undefined;
    private indexer: (item: T | undefined) => IIndexItem[];

    constructor(service: ITableService, indexer: (item: T | undefined) => IIndexItem[], specifier?: string) {
        this.service = service;
        this.specifier = specifier;
        this.indexer = indexer;
    }

    /**
     * Not supported for table persistence. Querying is intended to be performed on "sub-items" of the current
     * actor (like the queue items of a queue actor), but a table implementaton asuumes that all records are
     * "similar" (no sub items, only main items). In addition to this, it is not trivial to map the way
     * sortkeyfrom/to work to corresponding key expressions.
     */
    public async query(_options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>> {
        throw new Error('Unsupported operation: TablePersistence.query');
    }

    public async search(options: ITableSearchRequest & ITablePersistenceSearchRequest): Promise<ITableSearchResponse> {
        if (!options.index) {
            // Search on main table

            // Any partition keys in options are represented as prefix of the sort key in the table (because all items must be
            // together in one table partition to allow atomic transactions and efficient queries). So, we add the length of the
            // pk + the pk fields as additional key constraints here.
            const keysPrefix: IKeyConstraint[] = [
                { operator: 'eq', value: (options.partitionKey?.length ?? 0).toString() },
                ...(options.partitionKey?.map((field) => ({ operator: 'eq', value: field } as IKeyConstraint)) ?? [])
            ];

            const opts2: ITableSearchRequest = {
                keys: [...keysPrefix, ...(options.keys ?? [])],
                filter: options.filter,
                keysOrder: options.keysOrder,
                specifier: this.specifier,
                tableProjection: options.tableProjection,
                continuationToken: options.continuationToken,
                maxItems: options.maxItems
            };

            const results = await this.service.search(opts2);
            const response: ITableSearchResponse = { items: [], continuationToken: results.continuationToken };

            for (const item of results.items) {
                response.items.push({
                    id: item.id,
                    tableFields: item.tableFields
                });
            }
            return response;
        } else {
            // Search on index table (not the main table)

            const opts2: ITableSearchRequest = {
                index: options.index,
                keys: options.keys,
                filter: options.filter,
                keysOrder: options.keysOrder,
                specifier: this.specifier,
                tableProjection: options.tableProjection,
                indexProjection: options.indexProjection,
                continuationToken: options.continuationToken,
                maxItems: options.maxItems
            };

            const results = await this.service.search(opts2);
            const response: ITableSearchResponse = { items: [], continuationToken: results.continuationToken };

            for (const item of results.items) {
                response.items.push({
                    id: item.id,
                    keys: item.keys,
                    tableFields: item.tableFields,
                    indexFields: item.indexFields
                });
            }
            return response;
        }
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        return new TablePersistable(this, partitionKey, sortKey, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[] | undefined): Promise<IPersistable<T>> {
        const result = this.persistable(partitionKey, sortKey, undefined);
        await result.load();
        return result;
    }

    public async loadImpl(
        partitionKey?: string[],
        sortKey?: string[] | undefined
    ): Promise<[value: T | undefined, version: string | undefined, baseline: string | undefined]> {
        const result = await this.service.get({
            specifier: this.specifier,
            keys: this.toKey(partitionKey, sortKey)
        });

        const value = result.data as T;
        return [value, result.version, result.baseline];
    }

    public async storeImpl(
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined,
        version: string,
        baseline: string | undefined
    ): Promise<ITablePutResponse> {
        const result = await this.service.put({
            specifier: this.specifier,
            indexes: this.indexer(value),
            baseline,
            id: this.toKey(partitionKey, sortKey),
            data: value as { [key: string]: unknown },
            version
        });
        return result;
    }

    public sub(partitionKey?: string[] | undefined): IPersistence<T> {
        return new SubPersistence(this, partitionKey);
    }

    protected toKey(pk: string[] | undefined, sk: string[] | undefined): string[] {
        // To discriminate between pk=['A'], sk=[] and 'pk=[], sk=['A'], we add the pk length field.
        return [(pk?.length ?? 0).toString(), ...(pk ?? []), ...(sk ?? [])];
    }
}
