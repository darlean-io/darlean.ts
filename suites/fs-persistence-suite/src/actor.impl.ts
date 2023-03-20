import {
    action,
    IActivatable,
    IDeactivatable,
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceStoreBatchOptions,
    IPersistenceStoreOptions
} from '@darlean/base';
import { Database, OPEN_CREATE, OPEN_READWRITE, StatementPool } from './sqlite-async';
import fs from 'fs';
import {
    decodeKeyReadable,
    encodeKeyReadable,
    filterStructure,
    IDeSer,
    IMultiFilter,
    ITime,
    ITimer,
    parseMultiFilter,
    SharedExclusiveLock
} from '@darlean/utils';
import { OPEN_READONLY } from 'sqlite3';
import { Filterer, IFilterContext } from './filtering';

const TABLE = 'data';
const INDEX_SRC = 'srcidx';
const FIELD_PK = 'pk';
const FIELD_SK = 'sk';
const FIELD_VALUE = 'value';
const FIELD_SOURCE_NAME = 'sourcename';
const FIELD_SOURCE_SEQ = 'sourceseq';

const SOURCE = 'source';

const MAX_RESPONSE_LENGTH = 500 * 1000;

interface IConnection {
    db: Database;
    lock?: SharedExclusiveLock;
    poolLoad?: StatementPool;
    poolStore?: StatementPool;
    poolDelete?: StatementPool;
    poolQueryAsc?: StatementPool;
    poolQueryDesc?: StatementPool;
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

export class FsPersistenceActor implements IActivatable, IDeactivatable {
    private connections: IConnection[];
    private basePath: string;
    private keyWhere: string;
    private lastSeqNr = 0;
    private lockId = 0;
    private commitWaiters: Array<(err: unknown) => void>;
    private time: ITime;
    private commitTimer?: ITimer;
    private filterer: Filterer;
    private deser: IDeSer;

    constructor(basePath: string, time: ITime, filterer: Filterer, deser: IDeSer) {
        this.basePath = basePath;

        this.keyWhere = this.makeKeyWhere();
        this.connections = [];

        this.commitWaiters = [];

        this.time = time;
        this.filterer = filterer;
        this.deser = deser;
    }

    public async activate(): Promise<void> {
        for (let idx = 0; idx < 2; idx++) {
            this.connections.push(await this.openDatabase(idx === 0 ? 'writable' : 'readonly'));
        }

        this.commitTimer = this.time.repeat(
            async () => {
                await this.commit();
            },
            'Commit',
            10
        );
    }

    public async deactivate(): Promise<void> {
        this.commitTimer?.cancel();
        await this.closeDatabase();
    }

    @action()
    public async touch(): Promise<void> {
        // Do nothing
    }

    @action({ locking: 'shared' })
    public async store(options: IPersistenceStoreOptions): Promise<void> {
        return this.storeBatchImpl({ items: [{ ...options, identifier: undefined }] });
    }

    @action({ locking: 'shared' })
    public async storeBatch(options: IPersistenceStoreBatchOptions): Promise<void> {
        return this.storeBatchImpl(options);
    }

    @action({ locking: 'shared' })
    public async load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const pool = this.getConnection('readonly').poolLoad;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const values = this.makeKeyValues(options.partitionKey, options.sortKey);

        const statement = pool.tryObtain() ?? (await pool.obtain());
        try {
            const result = (await statement.get(values)) as { [FIELD_VALUE]: Buffer };
            if (result) {
                const buffer = result.value;

                const projection = options.projectionFilter ? parseMultiFilter(options.projectionFilter) : undefined;
                return {
                    value: projection ? this.project(projection, buffer) : buffer
                };
            }
            return {};
        } finally {
            statement.release();
        }
    }

    @action({ locking: 'shared' })
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>> {
        const direction = options.sortKeyOrder ?? 'ascending';

        const pool =
            direction === 'descending'
                ? this.getConnection('readonly').poolQueryDesc
                : this.getConnection('readonly').poolQueryAsc;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const sortKeyFromString = options.sortKeyFrom ? encode(options.sortKeyFrom) : null;
        const sortKeyToString = options.sortKeyTo
            ? maxOutReadableEncodedString(encode([...options.sortKeyTo, ...(options.sortKeyToMatch === 'loose' ? [] : [''])]))
            : null;

        const result: IPersistenceQueryResult<Buffer> = {
            items: []
        };

        const values = [encode(options.partitionKey), sortKeyFromString, sortKeyToString];

        const statement = pool.tryObtain() ?? (await pool.obtain());
        try {
            const projection = options.projectionFilter ? parseMultiFilter(options.projectionFilter) : undefined;

            let length = 0;

            await statement.each(values, (row) => {
                const data = row as { [FIELD_PK]?: string; [FIELD_SK]?: string; [FIELD_VALUE]?: Buffer };
                if (
                    !options.filterExpression ||
                    this.filter(
                        data,
                        options.filterExpression,
                        options.filterFieldBase,
                        options.filterPartitionKeyOffset,
                        options.filterSortKeyOffset
                    )
                ) {
                    const value = projection ? this.project(projection, data[FIELD_VALUE]) : data[FIELD_VALUE];
                    length += value?.length ?? 0;
                    if (length > MAX_RESPONSE_LENGTH) {
                        result.continuationToken = 'NOT-YET-IMPLEMENTED';
                        // TODO This does not work, it returns from the current row-handler lambda but not from entire method
                        return result;
                    }
                    result.items.push({
                        sortKey: decode(data.sk ?? ''),
                        value
                    });
                }
            });
            return result;
        } finally {
            statement.release();
        }
    }

    protected async storeBatchImpl(options: IPersistenceStoreBatchOptions): Promise<void> {
        const connection = this.getConnection('writable');
        const lockId = (this.lockId++).toString();
        //connection.lock?.tryBeginShared(lockId) || (await connection.lock?.beginShared(lockId));
        connection.lock?.tryBeginExclusive(lockId) || (await connection.lock?.beginExclusive(lockId));
        try {
            for (const item of options.items) {
                if (item.value === undefined) {
                    const pool = this.getConnection('writable').poolDelete;
                    if (!pool) {
                        throw new Error('No statement pool');
                    }

                    const values = this.makeKeyValues(item.partitionKey, item.sortKey);

                    const statement = pool.tryObtain() ?? (await pool.obtain());
                    try {
                        await statement.run(values);
                    } finally {
                        statement.release();
                    }
                } else {
                    const pool = this.getConnection('writable').poolStore;
                    if (!pool) {
                        throw new Error('No statement pool');
                    }

                    const values: Array<string | Buffer | number> = this.makeKeyValues(item.partitionKey, item.sortKey);
                    values.push(item.value);
                    values.push(SOURCE);
                    const seqnr = this.lastSeqNr + 1;
                    this.lastSeqNr = seqnr;
                    values.push(seqnr);

                    const statement = pool.tryObtain() ?? (await pool.obtain());
                    try {
                        await statement.run(values);
                    } finally {
                        statement.release();
                    }
                }
            }
        } finally {
            //connection.lock?.endShared(lockId);
            connection.lock?.endExclusive(lockId);
        }
        await this.waitForCommit();
    }

    protected project(config: IMultiFilter, data: Buffer | undefined) {
        if (!data) {
            return undefined;
        }

        const parsed = this.deser.deserialize(data) as { [key: string]: unknown };
        if (!parsed) {
            return undefined;
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
                        const d2 = d ? (d[base] as typeof data2) ?? {} : {};
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

    protected async openDatabase(mode: 'writable' | 'readonly'): Promise<IConnection> {
        const filepath = this.basePath;
        if (!fs.existsSync(filepath)) {
            if (mode === 'writable') {
                fs.mkdirSync(filepath, { recursive: true });
            } else {
                throw new Error('Path does not exist');
            }
        }

        const filename = [filepath, 'store.db'].join('/');
        const db = new Database();
        await db.open(filename, mode === 'writable' ? OPEN_CREATE | OPEN_READWRITE : OPEN_READONLY);

        // Only exclusive mode makes it possible to use the faster WAL without having a shared lock
        // (which we do not have, as the nodes run on different machines).
        // await db.run('PRAGMA locking_mode=EXCLUSIVE;');
        // Enable the (faster) WAL mode
        await db.run('PRAGMA journal_mode=WAL;');

        // Never makes the database corrupt, but on a power failure at just the wrong time, some commits may be lost.
        // We take the risk -- and when we deploy with redundancy > 1, one of the other instances will still have
        // the lost commits, so after sync, they will be there again.
        await db.run('PRAGMA synchronous=NORMAL;');

        const connection: IConnection = {
            db,
            lock: mode === 'writable' ? new SharedExclusiveLock('exclusive') : undefined
        };

        if (mode === 'writable') {
            const MAX_SEQ = 'MaxSeq';

            await db.run(
                `CREATE TABLE IF NOT EXISTS ${TABLE} (${FIELD_PK} TEXT, ${FIELD_SK} TEXT, ${FIELD_VALUE} BLOB, ${FIELD_SOURCE_NAME} TEXT, ${FIELD_SOURCE_SEQ} NUMBER, PRIMARY KEY (${FIELD_PK}, ${FIELD_SK}))`
            );
            await db.run(
                `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_SRC} ON ${TABLE} (${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ})`
            );

            const seqnrPool = await db.prepare(
                `SELECT MAX(${FIELD_SOURCE_SEQ}) AS ${MAX_SEQ} FROM ${TABLE} WHERE ${FIELD_SOURCE_NAME}=?`
            );
            try {
                const query = seqnrPool.tryObtain() ?? (await seqnrPool.obtain());
                try {
                    const result = (await query.get(SOURCE)) as { [MAX_SEQ]: number | null };
                    this.lastSeqNr = result[MAX_SEQ] === null ? 0 : result[MAX_SEQ];
                } finally {
                    query.release();
                }
            } finally {
                await seqnrPool.finalize();
            }

            connection.poolStore = await this.makeStorePool(db);
            connection.poolDelete = await this.makeDeletePool(db);
        }

        connection.poolLoad = await this.makeLoadPool(db);
        connection.poolQueryAsc = await this.makeQueryPoolAsc(db);
        connection.poolQueryDesc = await this.makeQueryPoolDesc(db);

        if (mode === 'writable') {
            await db.run('BEGIN DEFERRED TRANSACTION');
        }

        return connection;
    }

    protected async makeLoadPool(db: Database): Promise<StatementPool> {
        // Note: SQLite does not enforce uniqueness of the (compound) primary key when using
        // NULL values for some of the fields. So, we use the number 0 for "not present"
        // (numbers are not used in key fields; the string "0" if different from number 0).
        return await db.prepare(`SELECT * FROM ${TABLE} WHERE (${this.keyWhere})`);
    }

    protected async makeQueryPoolAsc(db: Database): Promise<StatementPool> {
        return await db.prepare(
            `SELECT * FROM ${TABLE} WHERE (${FIELD_PK}=?1) AND (?2 IS NULL OR (${FIELD_SK} >=?2)) AND (?3 IS NULL OR (${FIELD_SK} <=?3)) ORDER BY ${FIELD_SK} ASC`
        );
    }

    protected async makeQueryPoolDesc(db: Database): Promise<StatementPool> {
        return await db.prepare(
            `SELECT * FROM ${TABLE} WHERE (${FIELD_PK}=?1) AND (?2 IS NULL OR (${FIELD_SK} >=?2)) AND (?3 IS NULL OR (${FIELD_SK} <=?3)) ORDER BY ${FIELD_SK} DESC`
        );
    }

    protected async makeStorePool(db: Database): Promise<StatementPool> {
        const placeholders = new Array(5).fill('?');
        return await db.prepare(
            `INSERT OR REPLACE INTO ${TABLE} (${FIELD_PK}, ${FIELD_SK}, ${FIELD_VALUE}, ${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ}) VALUES (${placeholders.join(
                ','
            )})`
        );
    }

    protected async makeDeletePool(db: Database): Promise<StatementPool> {
        return await db.prepare(`DELETE FROM ${TABLE} WHERE (${this.keyWhere})`);
    }

    protected makeKeyWhere() {
        return `${FIELD_PK}=? AND ${FIELD_SK}=?`;
    }

    protected makeKeyValues(partitionKey: string[], sortKey: string[] | undefined) {
        const pk = encode(partitionKey);
        const sk = encode(sortKey ?? []);
        return [pk, sk];
    }

    protected async closeDatabase() {
        for (const conn of this.connections) {
            const lockId = (this.lockId++).toString();
            try {
                if (conn.lock) {
                    await conn.lock.beginExclusive(lockId);
                    await conn.db.run('COMMIT TRANSACTION');
                }
                await conn.poolDelete?.finalize();
                await conn.poolLoad?.finalize();
                await conn.poolQueryAsc?.finalize();
                await conn.poolQueryDesc?.finalize();
                await conn.poolStore?.finalize();
                await conn.db.close();
            } finally {
                conn.lock?.endExclusive(lockId);
            }
        }
    }

    protected getConnection(mode: 'writable' | 'readonly'): IConnection {
        if (mode === 'writable') {
            return this.connections[0];
        } else {
            return this.connections[1];
        }
    }

    protected async commit() {
        const connection = this.getConnection('writable');
        const lockId = (this.lockId++).toString();
        let waiters: typeof this.commitWaiters | undefined;
        let err: unknown;

        await connection.lock?.beginExclusive(lockId);
        try {
            try {
                await connection.db.run('COMMIT TRANSACTION');
            } catch (e) {
                err = e;
            }

            await connection.db.run('BEGIN TRANSACTION');

            waiters = this.commitWaiters;
            this.commitWaiters = [];

            if (waiters.length === 0) {
                this.commitTimer?.pause();
            }
        } finally {
            connection.lock?.endExclusive(lockId);
        }

        for (const waiter of waiters) {
            waiter(err);
        }
    }

    protected async waitForCommit(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.commitWaiters.push((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
            this.commitTimer?.resume();
        });
    }
}
