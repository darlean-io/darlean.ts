import {
    IIndexItem,
    IPersistable,
    ITablePersistence,
    ITablePutResponse,
    ITableSearchItem,
    ITableSearchRequest,
    ITableSearchResponse,
    ITableService
} from '@darlean/base';

/**
 * For internal use. Helper class for {@link TablePersistence}.
 */
class TablePersistable<T> implements IPersistable<T> {
    private _changed = false;
    private persistence: TablePersistence<T>;
    private key: string[];
    private baseline?: string;

    public value?: T | undefined;
    public version?: string | undefined;

    constructor(persistence: TablePersistence<T>, key: string[], value: T | undefined) {
        this.persistence = persistence;
        this.key = key;
        this.value = value;
    }

    public async load(): Promise<T | undefined> {
        const result = await this.persistence.loadImpl(this.key);
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
        const result = await this.persistence.storeImpl(this.key, this.value, version, this.baseline);
        this.baseline = result.baseline;
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

/**
 * Implementation of persistence that uses a table as persistence.
 *
 * Although this class implements persistence, it does not implement {@link IPersistence}, because it is too fundamentally
 * different. One such difference is that it only understands "just keys", not "partition" or "sort" keys.
 */
export class TablePersistence<T> implements ITablePersistence<T> {
    private service: ITableService;
    private specifier: string | undefined;
    private indexer: (item: T | undefined) => IIndexItem[];

    constructor(service: ITableService, indexer: (item: T | undefined) => IIndexItem[], specifier?: string) {
        this.service = service;
        this.specifier = specifier;
        this.indexer = indexer;
    }

    public async search(options: ITableSearchRequest): Promise<ITableSearchResponse> {
        if (!options.index) {
            // Search on main table

            const opts2: ITableSearchRequest = {
                keys: [...(options.keys ?? [])],
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

    public async *searchChunks(options: ITableSearchRequest): AsyncGenerator<ITableSearchResponse, void> {
        let response: ITableSearchResponse | undefined;
        while (!response || response.continuationToken) {
            options.continuationToken = response?.continuationToken;
            response = await this.search(options);
            yield response;
        }
    }

    public async *searchItems(options: ITableSearchRequest): AsyncGenerator<ITableSearchItem, void> {
        let response: ITableSearchResponse | undefined;
        while (!response || response.continuationToken) {
            options.continuationToken = response?.continuationToken;
            response = await this.search(options);
            for (const item of response.items) {
                yield item;
            }
        }
    }

    public persistable(key: string[], value: T | undefined): IPersistable<T> {
        return new TablePersistable<T>(this, key, value);
    }

    public async load(key: string[]): Promise<IPersistable<T>> {
        const result = this.persistable(key, undefined);
        await result.load();
        return result;
    }

    public async loadImpl(
        key: string[]
    ): Promise<[value: T | undefined, version: string | undefined, baseline: string | undefined]> {
        const result = await this.service.get({
            specifier: this.specifier,
            keys: key
        });

        const value = result.data as T;
        return [value, result.version, result.baseline];
    }

    public async storeImpl(
        key: string[],
        value: T | undefined,
        version: string,
        baseline: string | undefined
    ): Promise<ITablePutResponse> {
        const result = await this.service.put({
            specifier: this.specifier,
            indexes: this.indexer(value),
            baseline,
            id: key,
            data: value as { [key: string]: unknown },
            version
        });
        return result;
    }
}
