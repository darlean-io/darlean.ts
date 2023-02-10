import { action, IActivatable, IDeactivatable } from '@darlean/base';
import type {
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceStoreOptions
} from '@darlean/persistence-suite';
import { Database, OPEN_CREATE, OPEN_READWRITE, StatementPool } from './sqlite-async';
import fs from 'fs';
import { decodeKeyCompact, encodeKeyCompact } from '@darlean/utils';

const TABLE = 'data';
const INDEX_SRC = 'srcidx';
const FIELD_PK = 'pk';
const FIELD_SK = 'sk';
const FIELD_VALUE = 'value';
const FIELD_SOURCE_NAME = 'sourcename';
const FIELD_SOURCE_SEQ = 'sourceseq';

const SOURCE = 'source';

export class FsPersistenceActor implements IActivatable, IDeactivatable {
    private db?: Database;
    private basePath: string;
    private poolLoad?: StatementPool;
    private poolStore?: StatementPool;
    private poolDelete?: StatementPool;
    private poolQueryAsc?: StatementPool;
    private poolQueryDesc?: StatementPool;
    private keyWhere: string;
    private lastSeqNr = 0;

    constructor(basePath: string) {
        this.basePath = basePath;

        this.keyWhere = this.makeKeyWhere();
    }

    public async activate(): Promise<void> {
        await this.openDatabase();
    }

    public async deactivate(): Promise<void> {
        await this.closeDatabase();
    }

    @action()
    public async touch(): Promise<void> {
        // Do nothing
    }

    @action()
    public async store(options: IPersistenceStoreOptions): Promise<void> {
        if (options.value === undefined) {
            const pool = this.poolDelete;
            if (!pool) {
                throw new Error('No statement pool');
            }

            const values = this.makeKeyValues(options.partitionKey, options.sortKey);

            const statement = await pool.obtain();
            try {
                await statement.run(values);
            } finally {
                await statement.release();
            }
        } else {
            const pool = this.poolStore;
            if (!pool) {
                throw new Error('No statement pool');
            }

            const values: Array<string | Buffer | number> = this.makeKeyValues(options.partitionKey, options.sortKey);
            values.push(options.value);
            values.push(SOURCE);
            const seqnr = this.lastSeqNr + 1;
            this.lastSeqNr = seqnr;
            values.push(seqnr);

            const statement = await pool.obtain();
            try {
                await statement.run(values);
            } finally {
                await statement.release();
            }
        }
    }

    @action()
    public async load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const pool = this.poolLoad;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const values = this.makeKeyValues(options.partitionKey, options.sortKey);

        const statement = await pool.obtain();
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
            await statement.release();
        }
    }

    @action()
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult> {
        const direction = options.sortKeyOrder ?? 'ascending';

        const pool = direction === 'descending' ? this.poolQueryDesc : this.poolQueryAsc;
        if (!pool) {
            throw new Error('No statement pool');
        }

        const values = this.makeKeyValues(options.partitionKey, options.sortKey);

        const result: IPersistenceQueryResult = {
            items: []
        };

        const statement = await pool.obtain();
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
            await statement.release();
        }
    }

    protected async openDatabase() {
        const filepath = this.basePath;
        if (!fs.existsSync(filepath)) {
            fs.mkdirSync(filepath, { recursive: true });
        }

        const filename = [filepath, 'store.db'].join('/');
        const db = new Database();
        await db.open(filename, OPEN_CREATE | OPEN_READWRITE);

        // Only exclusive mode makes it possible to use the faster WAL without having a shared lock
        // (which we do not have, as the nodes run on different machines).
        await db.run('PRAGMA locking_mode=EXCLUSIVE;');
        // Enabl;e the (faster) WAL mode
        await db.run('PRAGMA journal_mode=WAL;');

        const MAX_SEQ = 'MaxSeq';

        await db.run(
            `CREATE TABLE IF NOT EXISTS ${TABLE} (${FIELD_PK}, ${FIELD_SK}, ${FIELD_VALUE}, ${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ}, PRIMARY KEY (${FIELD_PK}, ${FIELD_SK}))`
        );
        await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_SRC} ON ${TABLE} (${FIELD_SOURCE_NAME}, ${FIELD_SOURCE_SEQ})`);
        const seqnrPool = await db.prepare(
            `SELECT MAX(${FIELD_SOURCE_SEQ}) AS ${MAX_SEQ} FROM ${TABLE} WHERE ${FIELD_SOURCE_NAME}=?`
        );
        const query = await seqnrPool.obtain();
        try {
            const result = (await query.get(SOURCE)) as { [MAX_SEQ]: number | null };
            this.lastSeqNr = result[MAX_SEQ] === null ? 0 : result[MAX_SEQ];
        } finally {
            query.release();
        }

        this.poolLoad = await this.makeLoadPool(db);
        this.poolStore = await this.makeStorePool(db);
        this.poolDelete = await this.makeDeletePool(db);
        this.poolQueryAsc = await this.makeQueryPoolAsc(db);
        this.poolQueryDesc = await this.makeQueryPoolDesc(db);
    }

    protected async makeLoadPool(db: Database): Promise<StatementPool> {
        // Note: SQLite does not enforce uniqueness of the (compound) primary key when using
        // NULL values for some of the fields. So, we use the number 0 for "not present"
        // (numbers are not used in key fields; the string "0" if different from number 0).
        return await db.prepare(`SELECT * FROM ${TABLE} WHERE (${this.keyWhere})`);
    }

    protected async makeQueryPoolAsc(db: Database): Promise<StatementPool> {
        return await db.prepare(`SELECT * FROM ${TABLE} WHERE (${FIELD_PK}=? AND ${FIELD_SK} >=?)`);
    }

    protected async makeQueryPoolDesc(db: Database): Promise<StatementPool> {
        return await db.prepare(`SELECT * FROM ${TABLE} WHERE (${FIELD_PK}=? AND ${FIELD_SK} <=?) ORDER BY SK DESC`);
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
        await this.db?.close();
    }
}
