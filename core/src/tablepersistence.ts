import {
    CustomPersistable,
    IMultiChunkTableSearchRequest,
    IPersistable,
    ITableIndexItem,
    ITablePersistence,
    ITablePutResponse,
    ITableSearchItem,
    ITableSearchRequest,
    ITableSearchResponse,
    ITablesService
} from '@darlean/base';
import { IDeSer } from '@darlean/utils';

/**
 * For internal use. Helper class for {@link TablePersistence}.
 */
class TablePersistable<T> extends CustomPersistable<T> {
    private _baseline?: string;

    constructor(
        private onLoad: () => Promise<[value: T | undefined, version: string | undefined, baseline: string | undefined]>,
        private onStore: (value: T | undefined, version: string, baseline: string | undefined) => Promise<ITablePutResponse>,
        value: T | undefined
    ) {
        super(value);
    }

    protected async _load(): Promise<{ value: T | undefined; version: string | undefined }> {
        const result = await this.onLoad();
        this._baseline = result[2];
        return { value: result[0], version: result[1] };
    }

    protected async _persist(value: T | undefined, version: string): Promise<void> {
        const result = await this.onStore(value, version, this._baseline);
        this._baseline = result.baseline;
    }
}

/**
 * Implementation of persistence that uses a table as persistence.
 *
 * Although this class implements persistence, it does not implement {@link IPersistence}, because it is too fundamentally
 * different. One such difference is that it only understands "just keys", not "partition" or "sort" keys.
 */
export class TablePersistence<T> implements ITablePersistence<T> {
    private service: ITablesService;
    private specifier: string | undefined;
    private indexer: (item: T) => ITableIndexItem[];

    constructor(service: ITablesService, indexer: (item: T) => ITableIndexItem[], private deser: IDeSer, specifier?: string) {
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
                maxChunkItems: options.maxChunkItems ?? options.maxItems,
                indexRepresentation: options.indexRepresentation,
                tableRepresentation: options.tableRepresentation
            };

            const results = this.deser.deserializeTyped(await this.service.searchBuffer(opts2));
            const response: ITableSearchResponse = { items: [], continuationToken: results.continuationToken };

            for (const item of results.items) {
                response.items.push({
                    id: item.id,
                    tableFields: item.tableFields,
                    tableBuffer: item.tableBuffer
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
                maxChunkItems: options.maxChunkItems,
                tableRepresentation: options.tableRepresentation,
                indexRepresentation: options.indexRepresentation
            };

            const results = this.deser.deserializeTyped(await this.service.searchBuffer(opts2));
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

    public async *searchChunks(options: ITableSearchRequest & IMultiChunkTableSearchRequest): AsyncGenerator<ITableSearchResponse, void> {
        let response: ITableSearchResponse | undefined;
        let nRowsRemaining = options.maxTotalItems ?? undefined;
        while ((!response || response.continuationToken) && (nRowsRemaining === undefined || nRowsRemaining > 0)) {
            options.continuationToken = response?.continuationToken;
            if (nRowsRemaining !== undefined) {
                options.maxChunkItems = ((options.maxChunkItems ?? options.maxItems ?? 0) > nRowsRemaining) ? nRowsRemaining : options.maxChunkItems ?? options.maxItems;
            }
            
            response = await this.search(options);
            yield response;
            if (nRowsRemaining !== undefined) {
                nRowsRemaining -= response.items.length;
            } 
        }
    }

    public async *searchItems(options: ITableSearchRequest & IMultiChunkTableSearchRequest): AsyncGenerator<ITableSearchItem, void> {
        let response: ITableSearchResponse | undefined;
        let nRowsRemaining = options.maxTotalItems ?? undefined;
        while ((!response || response.continuationToken) && (nRowsRemaining === undefined || nRowsRemaining > 0)) {
            options.continuationToken = response?.continuationToken;
            if (nRowsRemaining !== undefined) {
                options.maxChunkItems = ((options.maxChunkItems ?? options.maxItems ?? 0) > nRowsRemaining) ? nRowsRemaining : options.maxChunkItems ?? options.maxItems;
            }

            response = await this.search(options);
            for (const item of response.items) {
                if (nRowsRemaining !== undefined) {
                    nRowsRemaining--;
                    if (nRowsRemaining < 0) {
                        return;
                    }
                }

                yield item;
            }
        }
    }

    public persistable(key: string[], value: T | undefined): IPersistable<T> {
        return new TablePersistable<T>(
            () => this.loadImpl(key),
            (value, version, baseLine) => this.storeImpl(key, value, version, baseLine),
            value
        );
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
            keys: key,
            representation: 'fields'
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
            indexes: value ? this.indexer(value) : [],
            baseline,
            id: key,
            data: value as { [key: string]: unknown },
            version
        });
        return result;
    }
}
