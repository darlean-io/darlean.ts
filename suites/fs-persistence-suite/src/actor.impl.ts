import {
    action,
    IActivatable,
    IDeactivatable,
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceStoreOptions
} from '@darlean/base';
import { Database, OPEN_CREATE, OPEN_READWRITE, StatementPool } from './sqlite-async';
import fs from 'fs';
import { decodeKeyCompact, encodeKeyCompact, ITime, ITimer, SharedExclusiveLock } from '@darlean/utils';
import { OPEN_READONLY } from 'sqlite3';

const TABLE = 'data';
const INDEX_SRC = 'srcidx';
const FIELD_PK = 'pk';
const FIELD_SK = 'sk';
const FIELD_VALUE = 'value';
const FIELD_SOURCE_NAME = 'sourcename';
const FIELD_SOURCE_SEQ = 'sourceseq';

const SOURCE = 'source';

interface IConnection {
    db: Database;
    lock?: SharedExclusiveLock;
    poolLoad?: StatementPool;
    poolStore?: StatementPool;
    poolDelete?: StatementPool;
    poolQueryAsc?: StatementPool;
    poolQueryDesc?: StatementPool;
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

    constructor(basePath: string, time: ITime) {
        this.basePath = basePath;

        this.keyWhere = this.makeKeyWhere();
        this.connections = [];

        this.commitWaiters = [];

        this.time = time;
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
        const connection = this.getConnection('writable');
        const lockId = (this.lockId++).toString();
        connection.lock?.tryBeginShared(lockId) || (await connection.lock?.beginShared(lockId));
        try {
            if (options.value === undefined) {
                const pool = this.getConnection('writable').poolDelete;
                if (!pool) {
                    throw new Error('No statement pool');
                }

                const values = this.makeKeyValues(options.partitionKey, options.sortKey);

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

                const values: Array<string | Buffer | number> = this.makeKeyValues(options.partitionKey, options.sortKey);
                values.push(options.value);
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
        } finally {
            connection.lock?.endShared(lockId);
        }
        await this.waitForCommit();
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
                return {
                    value: buffer
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

        const sortKeyFromString = options.sortKeyFrom ? encodeKeyCompact(options.sortKeyFrom) : null;
        const sortKeyToString = options.sortKeyTo ? encodeKeyCompact(options.sortKeyTo) : null;
        const sortKeyPrefixString = options.sortKeyPrefix ? encodeKeyCompact(options.sortKeyPrefix) : null;
        const sortKeyPrefixEndString = sortKeyPrefixString === null ? null : maxOut(sortKeyPrefixString);

        // Yes, we *intentionaly* use determineMax to determine min and vice versa...
        const min = determineMax(sortKeyFromString, sortKeyPrefixString);
        const max = determineMin(sortKeyToString, sortKeyPrefixEndString);

        const result: IPersistenceQueryResult<Buffer> = {
            items: []
        };

        const values = [encodeKeyCompact(options.partitionKey), min, max];

        const statement = pool.tryObtain() ?? (await pool.obtain());
        try {
            await statement.each(values, (row) => {
                const data = row as { [FIELD_PK]?: string; [FIELD_SK]?: string; [FIELD_VALUE]?: Buffer };
                result.items.push({
                    sortKey: decodeKeyCompact(data.sk ?? ''),
                    value: data.value
                });
            });
            return result;
        } finally {
            statement.release();
        }
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
                `CREATE TABLE IF NOT EXISTS ${TABLE} (${FIELD_PK}, ${FIELD_SK}, ${FIELD_VALUE}, ${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ}, PRIMARY KEY (${FIELD_PK}, ${FIELD_SK}))`
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
            await db.run('BEGIN TRANSACTION');
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
            `SELECT * FROM ${TABLE} WHERE (${FIELD_PK}=?1) AND (?2 IS NULL OR (${FIELD_SK} >=?2)) AND (?3 IS NULL OR (${FIELD_SK} <=?3))`
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
        const pk = encodeKeyCompact(partitionKey);
        const sk = encodeKeyCompact(sortKey ?? []);
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

const MAX_UNICODE_CHAR = 1114111;

function maxOut(value: string): string {
    return value + String.fromCodePoint(MAX_UNICODE_CHAR);
}

function determineMin(a: string | null, b: string | null) {
    if (a === null) {
        return b;
    }
    if (b === null) {
        return a;
    }
    const v = Buffer.compare(Buffer.from(a), Buffer.from(b));
    return v <= 0 ? a : b;
}

function determineMax(a: string | null, b: string | null) {
    if (a === null) {
        return b;
    }
    if (b === null) {
        return a;
    }
    const v = Buffer.compare(Buffer.from(a), Buffer.from(b));
    return v >= 0 ? a : b;
}
