import {
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceStoreBatchOptions
} from '@darlean/base';
import fs from 'fs';
import {
    decodeKeyReadable,
    encodeKeyReadable,
    filterStructure,
    IDeSer,
    IMultiFilter,
    ITime,
    parseMultiFilter,
    SharedExclusiveLock,
    MultiDeSer,
    Time
} from '@darlean/utils';
import { Filterer, IFilterContext } from './filtering';
import { expose } from 'threads/worker';
import { SqliteDatabase, StatementPool } from './sqlite-sync';

const TABLE = 'data';
const INDEX_SRC = 'srcidx';
const FIELD_PK = 'pk';
const FIELD_SK = 'sk';
const FIELD_VALUE = 'value';
const FIELD_SOURCE_NAME = 'sourcename';
const FIELD_SOURCE_SEQ = 'sourceseq';
const FIELD_VERSION = 'version';

const SOURCE = 'source';

const MAX_RESPONSE_LENGTH = 500 * 1000;

interface IContinuationToken {
    sk: string;
}

interface IConnection {
    db: SqliteDatabase;
    lock?: SharedExclusiveLock;
    poolLoad?: StatementPool;
    poolStore?: StatementPool;
    poolDelete?: StatementPool;
    poolQueryAsc?: StatementPool;
    poolQueryDesc?: StatementPool;
    poolQueryAscNoContents?: StatementPool;
    poolQueryDescNoContents?: StatementPool;
}

// IMPORTANT: When you change the encoding, also ensure that the maxOutReadableEncodedString function
// is adjusted accordingly!!!
const decode = decodeKeyReadable;
const encode = encodeKeyReadable;
function maxOutReadableEncodedString(value: string): string {
    // Because the readable encoding prefixes every character with a '.' or uses '--' for a separator, it
    // is safe to use 'Z' here at the position of a '.' or '-' for maxing out.
    return value + 'Z';
}

export class FsPersistenceWorker {
    private connection?: IConnection;
    private keyWhere: string;
    private lastSeqNr = 0;
    private filterer: Filterer;
    private deser: IDeSer;

    constructor(time: ITime, filterer: Filterer, deser: IDeSer) {
        this.keyWhere = this.makeKeyWhere();
        this.filterer = filterer;
        this.deser = deser;
    }

    public load(options: IPersistenceLoadOptions): IPersistenceLoadResult<Blob> {
        const pool = this.connection?.poolLoad;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const values = this.makeKeyValues(options.partitionKey, options.sortKey);

        const statement = pool.obtain();
        try {
            const result = statement.get(values) as { [FIELD_VALUE]: Buffer; [FIELD_VERSION]: string };
            if (result) {
                const buffer = result.value;

                const projection = options.projectionFilter ? parseMultiFilter(options.projectionFilter) : undefined;
                const value = projection ? this.project(projection, buffer, options.projectionBases ?? []) : buffer;
                return {
                    value: value ? new Blob([value]) : undefined,
                    version: result[FIELD_VERSION]
                };
            }
            return {};
        } finally {
            statement.release();
        }
    }

    public query(options: IPersistenceQueryOptions): IPersistenceQueryResult<Blob> {
        const direction = options.sortKeyOrder ?? 'ascending';

        const requiresContent = options.filterExpression || isContentFilter(options.projectionFilter);

        const pool =
            direction === 'descending'
                ? requiresContent
                    ? this.connection?.poolQueryDesc
                    : this.connection?.poolQueryDescNoContents
                : requiresContent
                ? this.connection?.poolQueryAsc
                : this.connection?.poolQueryAscNoContents;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const sortKeyFromString = options.sortKeyFrom ? encode(options.sortKeyFrom) : null;
        const sortKeyToString = options.sortKeyTo
            ? maxOutReadableEncodedString(encode([...options.sortKeyTo, ...(options.sortKeyToMatch === 'loose' ? [] : [''])]))
            : null;

        let limiter = options.sortKeyOrder === 'descending' ? maxOutReadableEncodedString('') : '';

        if (options.continuationToken) {
            const ct = JSON.parse(Buffer.from(options.continuationToken as string, 'base64').toString()) as IContinuationToken;
            limiter = ct.sk;
        }

        const result: IPersistenceQueryResult<Blob> = {
            items: []
        };

        // When we have a filter expression, do not set a hard limit, but iterate over entire result set until we
        // have maxItems *filtered* results.
        const limit = options.maxItems && !options.filterExpression ? options.maxItems : -1;

        const values = [
            encode(options.partitionKey),
            sortKeyFromString,
            sortKeyFromString,
            sortKeyToString,
            sortKeyToString,
            limiter,
            limit
        ];

        const statement = pool.obtain();
        try {
            const projection = options.projectionFilter ? parseMultiFilter(options.projectionFilter) : undefined;

            let length = 0;
            let lastSK: string | undefined;
            let nrows = 0;

            for (const row of statement.iterate(values)) {
                nrows++;
                const data = row as { [FIELD_PK]?: string; [FIELD_SK]?: string; [FIELD_VALUE]?: Buffer };
                if (
                    !requiresContent ||
                    !options.filterExpression ||
                    this.filter(
                        data,
                        options.filterExpression,
                        options.filterFieldBase,
                        options.filterPartitionKeyOffset,
                        options.filterSortKeyOffset
                    )
                ) {
                    const deserFields = options.filterFieldBase ? [options.filterFieldBase] : [];
                    const value = requiresContent
                        ? projection
                            ? this.project(projection, data[FIELD_VALUE], deserFields)
                            : data[FIELD_VALUE]
                        : undefined;
                    length += value?.length ?? 0;
                    if (length > MAX_RESPONSE_LENGTH) {
                        if (result.items.length === 0) {
                            throw new Error('Data too large');
                        }
                        const ct: IContinuationToken = { sk: lastSK ?? '' };
                        const ctEncoded = Buffer.from(JSON.stringify(ct)).toString('base64');
                        result.continuationToken = ctEncoded;
                        return result;
                    }
                    result.items.push({
                        sortKey: decode(data.sk ?? ''),
                        value: value ? new Blob([value]) : undefined
                    });
                    lastSK = data.sk;
                }
            }
            const canHaveMore = options.maxItems !== undefined && nrows >= options.maxItems;
            if (canHaveMore) {
                const ct: IContinuationToken = { sk: lastSK ?? '' };
                const ctEncoded = Buffer.from(JSON.stringify(ct)).toString('base64');
                result.continuationToken = ctEncoded;
            }
            return result;
        } finally {
            statement.release();
        }
    }

    public async storeBatch(options: IPersistenceStoreBatchOptions<Blob>): Promise<void> {
        this.connection?.db.run('BEGIN TRANSACTION');
        try {
            for (const item of options.items) {
                const version = item.version;
                if (item.value === undefined) {
                    // Delete record
                    const pool = this.connection?.poolDelete;
                    if (!pool) {
                        throw new Error('No statement pool');
                    }

                    const values = [...this.makeKeyValues(item.partitionKey, item.sortKey), version];

                    const statement = pool.obtain();
                    try {
                        statement.run(values);
                    } finally {
                        statement.release();
                    }
                } else {
                    // Upsert record
                    const pool = this.connection?.poolStore;
                    if (!pool) {
                        throw new Error('No statement pool');
                    }

                    const seqnr = this.lastSeqNr + 1;
                    this.lastSeqNr = seqnr;

                    const value = Buffer.from(await item.value.arrayBuffer());

                    const values: Array<string | Buffer | number> = this.makeKeyValues(item.partitionKey, item.sortKey);
                    values.push(value);
                    values.push(SOURCE);
                    values.push(seqnr);
                    values.push(version);
                    values.push(value);
                    values.push(SOURCE);
                    values.push(seqnr);
                    values.push(version);
                    values.push(version);

                    const statement = pool.obtain();
                    try {
                        statement.run(values);
                    } finally {
                        statement.release();
                    }
                }
            }
        } finally {
            this.connection?.db.run('COMMIT TRANSACTION');
        }
    }

    protected project(config: IMultiFilter, data: Buffer | undefined, deserFields: string[]) {
        if (!data) {
            return undefined;
        }

        const parsed = this.deser.deserialize(data) as { [key: string]: unknown };
        if (!parsed) {
            return undefined;
        }

        for (const field of deserFields) {
            const value = parsed[field];
            if (value && Buffer.isBuffer(value)) {
                parsed[field] = this.deser.deserialize(value);
            }
        }

        const filtered = filterStructure(config, parsed, '');

        return this.deser.serialize(filtered);
    }

    protected filter(
        data: { [FIELD_PK]?: string; [FIELD_SK]?: string; [FIELD_VALUE]?: Buffer },
        filter: unknown,
        base: string | undefined,
        pkOffset: number | undefined,
        skOffset: number | undefined
    ): boolean {
        let data2: { [key: string]: unknown } | undefined;
        let pkey2: string[] | undefined;
        let skey2: string[] | undefined;
        const context: IFilterContext = {
            data: () => {
                if (data2) {
                    return data2;
                }
                if (data[FIELD_VALUE]) {
                    const d = this.deser.deserialize(data[FIELD_VALUE]) as { [key: string]: unknown };
                    if (base) {
                        let dBase = d?.[base];
                        if (Buffer.isBuffer(dBase)) {
                            dBase = this.deser.deserialize(dBase) as typeof data2;
                        }
                        const d2 = (dBase as typeof data2) ?? {};
                        data2 = d2;
                        return d2;
                    }
                    data2 = d;
                    return d;
                } else {
                    data2 = {};
                    return data2;
                }
            },
            sortKey: (idx) => {
                const jdx = (skOffset ?? 0) + idx;
                if (skey2) {
                    return skey2[jdx];
                }
                const k = (data[FIELD_SK] ? decode(data[FIELD_SK]) : []) ?? [];
                skey2 = k;
                return k[jdx];
            },
            partitionKey: (idx) => {
                const jdx = (pkOffset ?? 0) + idx;
                if (pkey2) {
                    return pkey2[jdx];
                }
                const k = (data[FIELD_PK] ? decode(data[FIELD_PK]) : []) ?? [];
                pkey2 = k;
                return k[jdx];
            }
        };
        const value = this.filterer.process(context, filter);
        return this.filterer.isTruthy(value);
    }

    public openDatabase(basePath: string, mode: 'writable' | 'readonly'): void {
        const filepath = basePath;
        if (!fs.existsSync(filepath)) {
            if (mode === 'writable') {
                fs.mkdirSync(filepath, { recursive: true });
            } else {
                throw new Error('Path does not exist');
            }
        }

        const filename = [filepath, 'store.db'].join('/');
        const db = new SqliteDatabase();
        db.open(filename, mode !== 'writable');

        // Only exclusive mode makes it possible to use the faster WAL without having a shared lock
        // (which we do not have, as the nodes run on different machines).
        // Even though we access SQLite from multiple threads within 1 process, SQLIte still gives locked errors
        // for the reader threads when we enable exclusive locking.
        //db.run('PRAGMA locking_mode=EXCLUSIVE;');

        // Enable the (faster) WAL mode
        db.run('PRAGMA journal_mode=WAL;');

        // Never makes the database corrupt, but on a power failure at just the wrong time, some commits may be lost.
        // We take the risk -- and when we deploy with redundancy > 1, one of the other instances will still have
        // the lost commits, so after sync, they will be there again.
        db.run('PRAGMA synchronous=NORMAL;');

        const connection: IConnection = {
            db,
            lock: mode === 'writable' ? new SharedExclusiveLock('exclusive') : undefined
        };
        this.connection = connection;

        if (mode === 'writable') {
            const MAX_SEQ = 'MaxSeq';

            db.run(
                `CREATE TABLE IF NOT EXISTS ${TABLE} (${FIELD_PK} TEXT, ${FIELD_SK} TEXT, ${FIELD_VALUE} BLOB, ${FIELD_SOURCE_NAME} TEXT, ${FIELD_SOURCE_SEQ} NUMBER, ${FIELD_VERSION} TEXT, PRIMARY KEY (${FIELD_PK}, ${FIELD_SK}))`
            );
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_SRC} ON ${TABLE} (${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ})`);

            const seqnrPool = db.prepare(
                `SELECT MAX(${FIELD_SOURCE_SEQ}) AS ${MAX_SEQ} FROM ${TABLE} WHERE ${FIELD_SOURCE_NAME}=?`
            );
            try {
                const query = seqnrPool.obtain();
                try {
                    const result = query.get(SOURCE) as { [MAX_SEQ]: number | null };
                    this.lastSeqNr = result[MAX_SEQ] === null ? 0 : result[MAX_SEQ];
                } finally {
                    query.release();
                }
            } finally {
                seqnrPool.finalize();
            }

            connection.poolStore = this.makeStorePool(db);
            connection.poolDelete = this.makeDeletePool(db);
        }

        connection.poolLoad = this.makeLoadPool(db);
        connection.poolQueryAsc = this.makeQueryPoolAsc(db);
        connection.poolQueryDesc = this.makeQueryPoolDesc(db);
        connection.poolQueryAscNoContents = this.makeQueryPoolAsc(db, [FIELD_PK, FIELD_SK]);
        connection.poolQueryDescNoContents = this.makeQueryPoolDesc(db, [FIELD_PK, FIELD_SK]);
    }

    protected makeLoadPool(db: SqliteDatabase): StatementPool {
        // Note: SQLite does not enforce uniqueness of the (compound) primary key when using
        // NULL values for some of the fields. So, we use the number 0 for "not present"
        // (numbers are not used in key fields; the string "0" if different from number 0).
        return db.prepare(`SELECT * FROM ${TABLE} WHERE (${this.keyWhere})`);
    }

    protected makeQueryPoolAsc(db: SqliteDatabase, fields?: string[]): StatementPool {
        // The question marks stand for
        // - Partition key exact value
        // - Lower value of sort key
        // - Same as previous field (must be provided twice because better-sqlite does not support using numeric placeholders to reuse the same value)
        // - Upper value of sort key
        // - Same as previous field (must be provided twice because better-sqlite does not support using numeric placeholders to reuse the same value)
        // - Paging value that is used to continue a previous query
        // - Limit (or negative number to do not use a limit)

        const fieldNames = fields ? fields.join(',') : '*';
        return db.prepare(
            `SELECT ${fieldNames} FROM ${TABLE} WHERE (${FIELD_PK}=?) AND (? IS NULL OR (${FIELD_SK} >=?)) AND (? IS NULL OR (${FIELD_SK} <=?)) AND (${FIELD_SK} > ?) ORDER BY ${FIELD_SK} ASC LIMIT ?`
        );
    }

    protected makeQueryPoolDesc(db: SqliteDatabase, fields?: string[]): StatementPool {
        const fieldNames = fields ? fields.join(',') : '*';
        return db.prepare(
            `SELECT ${fieldNames} FROM ${TABLE} WHERE (${FIELD_PK}=?) AND (? IS NULL OR (${FIELD_SK} >=?)) AND (? IS NULL OR (${FIELD_SK} <=?)) AND (${FIELD_SK} < ?) ORDER BY ${FIELD_SK} DESC LIMIT ?`
        );
    }

    protected makeStorePool(db: SqliteDatabase): StatementPool {
        const placeholders = new Array(6).fill('?');
        return db.prepare(
            `INSERT INTO ${TABLE} (${FIELD_PK}, ${FIELD_SK}, ${FIELD_VALUE}, ${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ}, ${FIELD_VERSION}) ` +
                `VALUES (${placeholders.join(',')}) ` +
                `ON CONFLICT DO UPDATE SET ${FIELD_VALUE}=?, ${FIELD_SOURCE_NAME}=?, ${FIELD_SOURCE_SEQ}=?,${FIELD_VERSION}=? ` +
                `WHERE ${FIELD_VERSION} < ?`
        );
    }

    protected makeDeletePool(db: SqliteDatabase): StatementPool {
        return db.prepare(`DELETE FROM ${TABLE} WHERE (${this.keyWhere}) AND ${FIELD_VERSION} < ?`);
    }

    protected makeKeyWhere() {
        return `${FIELD_PK}=? AND ${FIELD_SK}=?`;
    }

    protected makeKeyValues(partitionKey: string[], sortKey: string[] | undefined) {
        const pk = encode(partitionKey);
        const sk = encode(sortKey ?? []);
        return [pk, sk];
    }

    public async closeDatabase() {
        this.connection?.poolDelete?.finalize();
        this.connection?.poolLoad?.finalize();
        this.connection?.poolQueryAsc?.finalize();
        this.connection?.poolQueryDesc?.finalize();
        this.connection?.poolQueryAscNoContents?.finalize();
        this.connection?.poolQueryDescNoContents?.finalize();
        this.connection?.poolStore?.finalize();
        this.connection?.db.close();
    }
}

function isContentFilter(filter: string[] | undefined) {
    if (filter === undefined) {
        return true;
    }

    if (filter.length !== 1) {
        return true;
    }

    return filter[0] !== '-*';
}

const worker = new FsPersistenceWorker(new Time(), new Filterer(), new MultiDeSer());

/*
export interface IFsPersistenceWorker {
    open(basePath: string, mode: 'readonly' | 'writable'): Promise<void>;
    close(): Promise<void>;
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult>;
    query<T>(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>>;
    storeBatch(options: IPersistenceStoreBatchOptions): Promise<IPersistenceStoreBatchResult>;
}*/

const workerdef = {
    open: (basePath: string, mode: 'readonly' | 'writable') => {
        return worker.openDatabase(basePath, mode);
    },
    close: () => {
        return worker.closeDatabase();
    },
    load: (options: IPersistenceLoadOptions) => {
        return worker.load(options);
    },
    query: (options: IPersistenceQueryOptions) => {
        return worker.query(options);
    },
    storeBatch: (options: IPersistenceStoreBatchOptions<Blob>) => {
        return worker.storeBatch(options);
    }
};

export type WorkerDef = typeof workerdef;

expose(workerdef);
