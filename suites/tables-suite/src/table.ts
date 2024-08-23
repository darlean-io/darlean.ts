import {
    action,
    and,
    ApplicationError,
    APPLICATION_ERROR_TABLE_ERROR,
    contains,
    containsni,
    eq,
    Expr,
    gte,
    ITableIndexItem,
    IPersistenceService,
    IPersistenceStoreBatchOptions,
    ITableGetRequest,
    ITableGetResponse,
    ITablePutRequest,
    ITablePutResponse,
    ITableSearchItem,
    ITableSearchRequest,
    ITableSearchResponse,
    ITablesService,
    literal,
    lte,
    prefix,
    sk
} from '@darlean/base';
import { BufferOf, IDeSer, parallel, ParallelTask } from '@darlean/utils';
import * as crypto from 'crypto';

interface IIndexEntry {
    id: string[];
    data?: { [key: string]: unknown } | Buffer;
}

interface IIndexReference {
    name: string;
    keys: string[];
    hash: string;
}

interface IBaseLine {
    indexes: IIndexReference[];
}

interface IBaseItem {
    data?: { [key: string]: unknown } | Buffer;
    baseline: IBaseLine;
}

type Operator = 'none' | 'exact' | 'prefix' | 'lte' | 'gte' | 'between';

export class TableActor implements ITablesService {
    private id: string[];
    private internalId: string[];
    private persistence: IPersistenceService;
    private shard: number;
    private deser: IDeSer;

    constructor(persistence: IPersistenceService, deser: IDeSer, id: string[], shard: number) {
        this.persistence = persistence;
        this.deser = deser;
        this.id = id;
        this.internalId = [id.length.toString(), ...id];
        this.shard = shard;
    }

    @action({ locking: 'shared' })
    public async put(request: ITablePutRequest): Promise<ITablePutResponse> {
        const sortKey = ['base', ...request.id];
        const isDelete = request.data === undefined;

        const indexes = request.indexes;
        const baseline = request.baseline
            ? this.decodeBaseline(request.baseline)
            : await this.fetchBaseline(sortKey, request.specifier);
        const hashes: Map<string, string> = new Map();

        const newBaseline: IBaseLine = {
            indexes: []
        };

        const itemKey = JSON.stringify(request.id);

        const batch: IPersistenceStoreBatchOptions<Buffer> = { items: [] };

        if (!isDelete) {
            // Persist new or changed index values
            for (const index of indexes) {
                const key = JSON.stringify([index.name, ...index.keys]);
                const hash = this.calculateHash(index);
                hashes.set(key, hash);
                const bli = baseline?.indexes.find((x) => JSON.stringify([x.name, ...x.keys]) === key);
                if (!bli || bli.hash !== hash) {
                    const entry: IIndexEntry = {
                        id: request.id,
                        data: this.deser.serialize(index.data)
                    };

                    batch.items.push({
                        partitionKey: ['Table', ...this.internalId, this.shard.toString()],
                        sortKey: ['index', index.name, ...index.keys, itemKey, hash],
                        specifier: request.specifier,
                        value: this.deser.serialize(entry),
                        version: request.version,
                        identifier: ''
                    });

                    newBaseline.indexes.push({
                        name: index.name,
                        keys: index.keys,
                        hash
                    });
                }
            }
        }

        // Persist the actual data.
        const baseItem: IBaseItem = {
            data: this.deser.serialize(request.data),
            baseline: newBaseline
        };
        batch.items.push({
            partitionKey: ['Table', ...this.internalId, this.shard.toString()],
            sortKey,
            specifier: request.specifier,
            value: isDelete ? undefined : this.deser.serialize(baseItem),
            version: request.version,
            identifier: ''
        });

        // Remove old index values.
        for (const bli of baseline?.indexes ?? []) {
            const key = JSON.stringify([bli.name, ...bli.keys]);
            const index = indexes.filter((x) => JSON.stringify([x.name, ...x.keys]) === key);
            const hash = hashes.get(key);
            if (!index || hash !== bli.hash) {
                batch.items.push({
                    partitionKey: ['Table', ...this.internalId, this.shard.toString()],
                    sortKey: ['index', bli.name, ...bli.keys, itemKey, bli.hash ?? ''],
                    specifier: request.specifier,
                    value: undefined,
                    version: request.version,
                    identifier: ''
                });
            }
        }

        const results = await this.persistence.storeBatch(batch);
        if (results.unprocessedItems.length > 0) {
            throw new ApplicationError(APPLICATION_ERROR_TABLE_ERROR, '');
        }

        return {
            baseline: isDelete ? undefined : this.encodeBaseline(newBaseline)
        };
    }

    @action({ locking: 'shared' })
    public get(request: ITableGetRequest): Promise<ITableGetResponse> {
        return this.getImpl(request);
    }

    @action({ locking: 'shared' })
    public search(request: ITableSearchRequest): Promise<ITableSearchResponse> {
        return this.searchImpl(request);
    }

    @action({ locking: 'shared' })
    public async searchBuffer(request: ITableSearchRequest): Promise<BufferOf<ITableSearchResponse>> {
        return this.deser.serialize(await this.searchImpl(request));
    }

    private async searchImpl(request: ITableSearchRequest): Promise<ITableSearchResponse> {
        let operator: Operator = 'none';
        const sortKey: string[] = [];
        let sortKey2: string[] = [];
        const filterParts: Expr[] = [];

        let phase: 'sortkey' | 'filter' = 'sortkey';
        let idx = -1;
        for (const c of request.keys ?? []) {
            idx++;
            if (phase === 'sortkey') {
                sortKey.push(c.value);
                switch (c.operator) {
                    case 'prefix':
                        operator = 'prefix';
                        phase = 'filter';
                        break;
                    case 'eq':
                        operator = 'exact';
                        break;
                    case 'gte':
                        operator = 'gte';
                        phase = 'filter';
                        break;
                    case 'lte':
                        operator = 'lte';
                        phase = 'filter';
                        break;
                    case 'between':
                        operator = 'between';
                        sortKey2 = [...sortKey.slice(0, -1), c.value2 as string];
                        phase = 'filter';
                        break;
                    case 'contains':
                        phase = 'filter';
                        filterParts.push(contains(sk(idx), literal(c.value)));
                        break;
                    case 'containsni':
                        phase = 'filter';
                        filterParts.push(containsni(sk(idx), literal(c.value)));
                        break;
                }
            } else {
                switch (c.operator) {
                    case 'prefix':
                        filterParts.push(prefix(sk(idx), literal(c.value)));
                        break;
                    case 'eq':
                        filterParts.push(eq(sk(idx), literal(c.value)));
                        break;
                    case 'gte':
                        filterParts.push(gte(sk(idx), literal(c.value)));
                        break;
                    case 'lte':
                        filterParts.push(lte(sk(idx), literal(c.value)));
                        break;
                    case 'between':
                        filterParts.push(gte(sk(idx), literal(c.value)));
                        filterParts.push(lte(sk(idx), literal(c.value2)));
                        break;
                    case 'contains':
                        filterParts.push(contains(sk(idx), literal(c.value)));
                        break;
                }
            }
        }

        if (request.filter) {
            filterParts.push(request.filter.expression);
        }

        if (request.index) {
            // Search of index table (not on base table)

            const filter = filterParts.length > 0 ? and(...filterParts) : undefined;
            const projection = request.indexProjection ? this.enhanceProjection(request.indexProjection) : undefined;

            const [sortKeyFrom, sortKeyTo, sortKeyToMatch] = this.deriveKeyInfo(operator, sortKey, sortKey2);

            const result = await this.persistence.query({
                partitionKey: ['Table', ...this.internalId, this.shard.toString()],
                sortKeyFrom: this.prefixSortKey(['index', request.index], sortKeyFrom),
                sortKeyTo: this.prefixSortKey(['index', request.index], sortKeyTo),
                sortKeyToMatch,
                sortKeyOrder: request.keysOrder ?? 'ascending',
                specifier: request.specifier,
                filterExpression: filter,
                filterFieldBase: 'data',
                filterSortKeyOffset: 2, // 'index' + name
                projectionFilter: projection,
                continuationToken: request.continuationToken,
                maxItems: request.maxItems
            });
            const response: ITableSearchResponse = {
                items: [],
                continuationToken: result.continuationToken
            };

            for (const item of result.items) {
                if (item.value) {
                    const value = this.deser.deserialize(item.value) as IIndexEntry;

                    const resultItem: ITableSearchItem = {
                        id: value.id,
                        // Remove 'index' + name at beginning and itemkey+hash that are added at the end
                        keys: item.sortKey.slice(2, -2),
                        indexFields: request.indexRepresentation !== 'buffer' ? this.extractDataFields(value.data) : undefined,
                        indexBuffer: request.indexRepresentation === 'buffer' ? this.extractDataBuffer(value.data) : undefined
                    };

                    response.items.push(resultItem);
                }
            }

            if (request.tableProjection) {
                const tasks: ParallelTask<ITableGetResponse, void>[] = [];
                for (const item of response.items) {
                    const id = item.id;
                    tasks.push(() => {
                        return this.getImpl({
                            keys: id,
                            projection: request.tableProjection ? this.enhanceProjection(request.tableProjection) : undefined,
                            specifier: request.specifier, // TODO: Get rid of this. This is index specifiers, not base table specifiers!
                            representation: request.tableRepresentation
                        });
                    });
                }
                const tableResults = await parallel(tasks, 5 * 1000, 100);
                let idx = -1;
                for (const result of tableResults.results) {
                    idx++;
                    if (result.result) {
                        if (request.tableRepresentation === 'buffer') {
                            response.items[idx].tableBuffer = result.result.dataBuffer;
                        } else {
                            response.items[idx].tableFields = result.result.data;
                        }
                    }
                }
            }

            return response;
        } else {
            // Search on 'base' table data (not on an index)

            const filter = filterParts.length > 0 ? and(...filterParts) : undefined;
            const isEmptyProjection = this.isEmptyProjection(request.tableProjection);
            const projection = isEmptyProjection
                ? request.tableProjection
                : request.tableProjection
                ? this.enhanceProjection(request.tableProjection)
                : undefined;

            const [sortKeyFrom, sortKeyTo, sortKeyToMatch] = this.deriveKeyInfo(operator, sortKey, sortKey2);

            const result = await this.persistence.query({
                partitionKey: ['Table', ...this.internalId, this.shard.toString()],
                sortKeyFrom: this.prefixSortKey(['base'], sortKeyFrom),
                sortKeyTo: this.prefixSortKey(['base'], sortKeyTo),
                sortKeyToMatch,
                sortKeyOrder: request.keysOrder ?? 'ascending',
                specifier: request.specifier,
                filterExpression: filter,
                filterFieldBase: 'data',
                filterSortKeyOffset: 1, // 'base'
                projectionFilter: projection,
                continuationToken: request.continuationToken,
                maxItems: request.maxItems
            });
            const response: ITableSearchResponse = {
                items: [],
                continuationToken: result.continuationToken
            };
            for (const item of result.items) {
                if (isEmptyProjection) {
                    const resultItem: ITableSearchItem = {
                        id: item.sortKey.slice(1)
                    };
                    response.items.push(resultItem);
                } else if (item.value) {
                    const value = this.deser.deserialize(item.value) as IBaseItem;

                    const resultItem: ITableSearchItem = {
                        id: item.sortKey.slice(1),
                        tableFields: request.tableRepresentation !== 'buffer' ? this.extractDataFields(value.data) : undefined,
                        tableBuffer: request.tableRepresentation === 'buffer' ? this.extractDataBuffer(value.data) : undefined
                    };

                    response.items.push(resultItem);
                }
            }

            return response;
        }
    }

    protected extractDataFields(data?: { [key: string]: unknown } | Buffer): { [key: string]: unknown } | undefined {
        if (Buffer.isBuffer(data)) {
            return this.deser.deserialize(data) as { [key: string]: unknown };
        }
        return data;
    }

    protected extractDataBuffer(data?: { [key: string]: unknown } | Buffer): Buffer | undefined {
        if (data === undefined) {
            return undefined;
        }
        if (Buffer.isBuffer(data)) {
            return data;
        }
        return this.deser.serialize(data);
    }

    protected deriveKeyInfo(
        operator: Operator,
        sortKey: string[] | undefined,
        sortKey2: string[] | undefined
    ): [string[] | undefined, string[] | undefined, 'strict' | 'loose'] {
        let sortKeyFrom: string[] | undefined;
        let sortKeyTo: string[] | undefined;
        let sortKeyLoose = false;

        switch (operator) {
            case 'exact':
                sortKeyFrom = sortKey;
                sortKeyTo = sortKey;
                break;
            case 'between':
                sortKeyFrom = sortKey;
                sortKeyTo = sortKey2;
                break;
            case 'gte':
                sortKeyFrom = sortKey;
                sortKeyTo = (sortKey?.length ?? 0) > 0 ? sortKey?.slice(0, sortKey.length - 1) : undefined;
                break;
            case 'lte':
                sortKeyTo = sortKey;
                sortKeyFrom = (sortKey?.length ?? 0) > 0 ? sortKey?.slice(0, sortKey.length - 1) : undefined;
                break;
            case 'prefix':
                sortKeyFrom = sortKey;
                sortKeyTo = sortKey;
                sortKeyLoose = true;
                break;
        }
        return [sortKeyFrom, sortKeyTo, sortKeyLoose ? 'loose' : 'strict'];
    }

    protected prefixSortKey(prefix: string[], key: string[] | undefined) {
        return [...prefix, ...(key ?? [])];
    }

    protected async fetchBaseline(keys: string[], specifier: string | undefined): Promise<IBaseLine> {
        const result = await this.persistence.load({
            partitionKey: ['Table', ...this.internalId, this.shard.toString()],
            sortKey: ['base', ...keys],
            specifier: specifier,
            projectionFilter: this.enhanceProjection([])
        });
        if (result.value) {
            const baseItem = this.deser.deserialize(result.value) as IBaseItem;
            return baseItem.baseline;
        } else {
            return { indexes: [] };
        }
    }

    protected async getImpl(request: ITableGetRequest): Promise<ITableGetResponse> {
        const result = await this.persistence.load({
            partitionKey: ['Table', ...this.internalId, this.shard.toString()],
            sortKey: ['base', ...request.keys],
            specifier: request.specifier,
            projectionFilter: request.projection ? this.enhanceProjection(request.projection) : undefined,
            projectionBases: ['data']
        });
        if (result.value) {
            const baseItem = this.deser.deserialize(result.value) as IBaseItem;
            return {
                version: result.version ?? '',
                data: request.representation !== 'buffer' ? this.extractDataFields(baseItem.data) : undefined,
                dataBuffer: request.representation === 'buffer' ? this.extractDataBuffer(baseItem.data) : undefined,
                baseline: this.encodeBaseline(baseItem.baseline)
            };
        } else {
            return {
                version: result.version ?? '',
                data: undefined,
                baseline: this.encodeBaseline({ indexes: [] })
            };
        }
    }

    protected calculateHash(item: ITableIndexItem) {
        const hash = crypto.createHash('sha1');
        for (const key of item.keys) {
            hash.update(key);
            hash.update('*');
        }
        if (item.data) {
            hash.update(JSON.stringify(item.data));
        }
        return hash.digest('base64');
    }

    protected encodeBaseline(baseline: IBaseLine | undefined) {
        return Buffer.from(JSON.stringify(baseline), 'utf-8').toString('base64');
    }

    protected decodeBaseline(baseline: string | undefined): IBaseLine | undefined {
        return baseline ? JSON.parse(Buffer.from(baseline, 'base64').toString('utf-8')) : undefined;
    }

    protected enhanceProjection(filter: string[]) {
        const result = filter.map((x) => x[0] + 'data.' + x.substring(1));
        result.push('-data.*');
        result.push('+*');
        return result;
    }

    protected isEmptyProjection(filter?: string[]) {
        return filter?.length === 1 && filter[0] === '-*';
    }
}
