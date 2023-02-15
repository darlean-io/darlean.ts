/**
 * This module provides a promise interface to the sqlite3 database module.
 *
 * Copied from https://www.npmjs.com/package/sqlite-async and then adjusted to have proper TS bindings
 * and pooling.
 */
import * as sqlite from 'sqlite3';

//-----------------------------------------------------------------------------
// The Database class
//-----------------------------------------------------------------------------

export const OPEN_READONLY = sqlite.OPEN_CREATE;
export const OPEN_READWRITE = sqlite.OPEN_READWRITE;
export const OPEN_CREATE = sqlite.OPEN_CREATE;

export class Database {
    protected db?: sqlite.Database;
    protected fileName?: string;

    public async open(filename: string, mode: number): Promise<void> {
        const m = mode ?? OPEN_READWRITE | OPEN_CREATE;

        return new Promise((resolve, reject) => {
            if (this.db) {
                return reject(new Error('Database.open: database is already open'));
            }
            const db = new sqlite.Database(filename, m, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.db = db;
                    this.fileName = filename;
                    resolve();
                }
            });
        });
    }

    public async close(): Promise<void> {
        if (!this.db) {
            return Promise.reject(new Error('Database.close: database is not open'));
        }
        const db = this.db;
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    this.db = undefined;
                    resolve();
                }
            });
        });
    }

    public async run(sql: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                return reject(new Error('Database.run: database is not open'));
            }

            // Need a real function because 'this' is used.
            function callback(err: unknown) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
            this.db?.run(sql, callback);
        });
    }

    public async prepare(sql: string): Promise<StatementPool> {
        if (!this.db) {
            throw new Error('Database.prepare: database is not open');
        }
        const pool = new StatementPool(this, sql);
        const s = await pool.obtain();
        s.release();
        return pool;
    }

    public async _prepare(pool: StatementPool, sql: string, params?: unknown): Promise<Statement> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                return reject(new Error('Database.prepare: database is not open'));
            }
            function callback(this: sqlite.Statement, err: unknown) {
                if (err) {
                    reject(err);
                } else {
                    resolve(new Statement(pool, this));
                }
            }
            this.db.prepare(sql, params ?? [], callback);
        });
    }
}

export class StatementPool {
    protected statements: Statement[];
    protected sql: string;
    protected db: Database;

    constructor(db: Database, sql: string) {
        this.db = db;
        this.sql = sql;
        this.statements = [];
    }

    public tryObtain(): Statement | undefined {
        return this.statements.pop();
    }

    public async obtain(): Promise<Statement> {
        if (this.statements.length === 0) {
            const s = await this.db._prepare(this, this.sql);
            return s;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.statements.pop()!;
        }
    }

    public release(value: Statement): void {
        this.statements.push(value);
    }

    public async finalize(): Promise<void> {
        for (const s of this.statements) {
            await s._finalize();
        }
    }
}

export class Statement {
    protected statement: sqlite.Statement;
    protected pool: StatementPool;

    constructor(pool: StatementPool, statement: sqlite.Statement) {
        if (!(statement instanceof sqlite.Statement)) {
            throw new TypeError(`Statement: 'statement' is not a statement instance`);
        }
        this.pool = pool;
        this.statement = statement;
    }

    public release(): void {
        this.pool.release(this);
    }

    public async _finalize(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.statement.finalize((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    public async run(params?: unknown): Promise<void> {
        return new Promise((resolve, reject) => {
            // Need a real function because 'this' is used.
            const callback = function (this: unknown, err: unknown) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            };
            this.statement.run(params ?? [], callback);
        });
    }

    public async get<T>(params?: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const callback = (err: unknown, row: T) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            };
            this.statement.get(params ?? [], callback);
        });
    }

    public async all<T>(params?: unknown): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const callback = (err: unknown, rows: T[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            };
            this.statement.all(params ?? [], callback);
        });
    }

    public async each<T>(params: unknown | undefined, handler: (row: T) => void): Promise<number> {
        return new Promise((resolve, reject) => {
            this.statement.each(
                params,
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        handler(row as T);
                    }
                },
                (err, count) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(count);
                    }
                }
            );
        });
    }
}
