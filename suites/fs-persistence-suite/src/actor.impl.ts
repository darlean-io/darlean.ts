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

export class FsPersistenceActor implements IActivatable, IDeactivatable {
    private db?: Database;
    private basePath: string;
    private partitionKeyLen: number;
    private sortKeyLen: number;
    private partitionKeys: string[];
    private sortKeys: string[];
    private poolLoad?: StatementPool;
    private poolStore?: StatementPool;
    private poolDelete?: StatementPool;
    private keyWhere: string;

    constructor(basePath: string, partitionKeyLen: number, sortKeyLen: number) {
        this.basePath = basePath;
        this.partitionKeyLen = partitionKeyLen;
        this.sortKeyLen = sortKeyLen;

        this.partitionKeys = [];
        for (let i = 0; i < partitionKeyLen; i++) {
            this.partitionKeys.push('pk' + i);
        }

        this.sortKeys = [];
        for (let i = 0; i < sortKeyLen; i++) {
            this.sortKeys.push('sk' + i);
        }

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
    
            const values = new Array(this.partitionKeyLen + this.sortKeyLen + 1).fill(0);
            for (let i = 0; i < options.partitionKey.length; i++) {
                values[i] = options.partitionKey[i]?.toString() ?? 0;
            }
            const offset = this.partitionKeyLen;
            if (options.sortKey) {
                for (let i = 0; i < options.sortKey?.length; i++) {
                    values[offset + i] = options.sortKey[i]?.toString() ?? 0;
                }
            }
            values[values.length - 1] = options.value;
    
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
            const result = (await statement.get(values)) as { value: Buffer };
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
    public async query(_options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult> {
        throw new Error('Method not implemented.');
    }

    protected async openDatabase() {
        const filepath = this.basePath;
        if (!fs.existsSync(filepath)) {
            fs.mkdirSync(filepath, { recursive: true });
        }

        const filename = [filepath, 'store.sqlite'].join('/');
        const db = new Database();
        await db.open(filename, OPEN_CREATE | OPEN_READWRITE);

        // Only exclusive mode makes it possible to use the faster WAL without having a shared lock
        // (which we do not have, as the nodes run on different machines).
        await db.run('PRAGMA locking_mode=EXCLUSIVE;');
        // Enabl;e the (faster) WAL mode
        await db.run('PRAGMA journal_mode=WAL;');

        const partitionKeys = this.partitionKeys.join(', ');
        const sortKeys = this.sortKeys.join(', ');
        const allKeys = [partitionKeys, sortKeys].join(', ');
        await db.run(`CREATE TABLE IF NOT EXISTS data (${allKeys}, value, PRIMARY KEY (${allKeys}))`);

        this.poolLoad = await this.makeLoadPool(db);
        this.poolStore = await this.makeStorePool(db);
        this.poolDelete = await this.makeDeletePool(db);
    }

    protected async makeLoadPool(db: Database): Promise<StatementPool> {
        // Note: SQLite does not enforce uniqueness of the (compound) primary key when using
        // NULL values for some of the fields. So, we use the number 0 for "not present"
        // (numbers are not used in key fields; the string "0" if different from number 0).
        return await db.prepare(`SELECT * FROM data WHERE (${this.keyWhere})`);
    }

    protected async makeStorePool(db: Database): Promise<StatementPool> {
        const parts = [...this.partitionKeys, ...this.sortKeys, 'value'];
        const placeholders = new Array(parts.length).fill('?');
        return await db.prepare(`INSERT OR REPLACE INTO data (${parts.join(',')}) VALUES (${placeholders.join(',')})`);
    }

    protected async makeDeletePool(db: Database): Promise<StatementPool> {
        return await db.prepare(`DELETE FROM data WHERE (${this.keyWhere})`);
    }

    protected makeKeyWhere() {
        const parts: string[] = [];
        for (let i = 0; i < this.partitionKeyLen; i++) {
            parts.push(`(${this.partitionKeys[i]}=?)`);
        }
        for (let i = 0; i < this.sortKeyLen; i++) {
            parts.push(`(${this.sortKeys[i]}=?)`);
        }
        const keyWhere = parts.join(' AND ');
        return keyWhere;
    }

    protected makeKeyValues(partitionKey: string[], sortKey: string[] | undefined) {
        const values = new Array(this.partitionKeyLen + this.sortKeyLen).fill(0);
        for (let i = 0; i < partitionKey.length; i++) {
            values[i] = partitionKey[i]?.toString() ?? 0;
        }
        const offset = this.partitionKeyLen;
        if (sortKey) {
            for (let i = 0; i < sortKey?.length; i++) {
                values[offset + i] = sortKey[i]?.toString() ?? 0;
            }
        }
    }

    protected async closeDatabase() {
        await this.db?.close();
    }
}
