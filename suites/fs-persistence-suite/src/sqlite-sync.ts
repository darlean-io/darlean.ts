/**
 * This module provides a promise interface to the better-sqlite3 database module.
 *
 * Originally copied from https://www.npmjs.com/package/sqlite-async and then adjusted to have proper TS bindings
 * and pooling.
 */
import { sleep } from '@darlean/utils';
import Database, { Database as DB, Statement as DBStatement } from 'better-sqlite3';

//-----------------------------------------------------------------------------
// The Database class
//-----------------------------------------------------------------------------

export class SqliteDatabase {
    protected db?: DB;
    protected fileName?: string;

    public open(filename: string, readonly: boolean): void {
        const db = new Database(filename, { readonly });
        this.db = db;
    }

    public close(): void {
        if (!this.db) {
            throw new Error('Database.close: database is not open');
        }
        this.db.close();
        this.db = undefined;
    }

    public run(sql: string): void {
        this.db?.exec(sql);
    }

    public prepare(sql: string): StatementPool {
        if (!this.db) {
            throw new Error('Database.prepare: database is not open');
        }
        const pool = new StatementPool(this, sql);
        const s = pool.obtain();
        s.release();
        return pool;
    }

    public _prepare(pool: StatementPool, sql: string): Statement {
        if (!this.db) {
            throw new Error('Database.prepare: database is not open');
        }
        const statement = this.db.prepare(sql);
        return new Statement(pool, statement);
    }
}

export class StatementPool {
    protected statements: Statement[];
    protected sql: string;
    protected db: SqliteDatabase;
    protected finalizing = false;
    protected used = 0;

    constructor(db: SqliteDatabase, sql: string) {
        this.db = db;
        this.sql = sql;
        this.statements = [];
    }

    public obtain(): Statement {
        this.used++;
        if (this.statements.length === 0) {
            const s = this.db._prepare(this, this.sql);
            return s;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.statements.pop()!;
        }
    }

    public release(value: Statement): void {
        try {
            if (this.finalizing) {
                // Do nothing
            } else {
                this.statements.push(value);
            }
        } finally {
            this.used--;
        }
    }

    public async finalize(): Promise<void> {
        this.finalizing = true;
        while (this.used > 0) {
            await sleep(1);
        }
    }
}

export class Statement {
    protected statement: DBStatement;
    protected pool: StatementPool;

    constructor(pool: StatementPool, statement: DBStatement) {
        this.pool = pool;
        this.statement = statement;
    }

    public release(): void {
        this.pool.release(this);
    }

    public run(params?: unknown): void {
        this.statement.run(params ?? []);
    }

    public get<T>(params?: unknown): T {
        return this.statement.get(params ?? []);
    }

    public all<T>(params?: unknown): T[] {
        return this.statement.all(params ?? []);
    }

    public each<T>(params: unknown | undefined, handler: (row: T) => void): number {
        let n = 0;
        for (const row of this.statement.iterate(params ?? [])) {
            n++;
            handler(row);
        }
        return n;
    }
}
