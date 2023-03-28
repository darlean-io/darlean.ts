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
import { Mutex } from '@darlean/utils';
import { ModuleThread, spawn, Thread, Worker } from 'threads';
import { WorkerDef } from './worker';

interface IConnection {
    worker: ModuleThread<WorkerDef>;
    mutex: Mutex<void>;
}

// For now, a fixed value. We can make this configurable/dynamic later on.
const NR_READERS = 10;

export class FsPersistenceActor implements IActivatable, IDeactivatable {
    private connections: IConnection[];
    private basePath: string;
    private lastConnIdx = 0;

    constructor(basePath: string) {
        this.basePath = basePath;
        this.connections = [];
    }

    public async activate(): Promise<void> {
        const promises: Promise<IConnection>[] = [];
        // Ensure writer creates the folder and database before the readers try to read it.
        const writableConn = await this.openDatabase('writable');
        for (let idx = 1; idx < NR_READERS + 1; idx++) {
            promises.push(this.openDatabase('readonly'));
        }
        this.connections = [writableConn, ...(await Promise.all(promises))];
    }

    public async deactivate(): Promise<void> {
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
        const conn = this.getConnection('readonly');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            return await conn.worker.load(options);
        } finally {
            conn.mutex.release();
        }
    }

    @action({ locking: 'shared' })
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>> {
        const conn = this.getConnection('readonly');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            return await conn.worker.query(options);
        } finally {
            conn.mutex.release();
        }
    }

    protected async storeBatchImpl(options: IPersistenceStoreBatchOptions): Promise<void> {
        // TODO: Combine multiple batches internally
        const conn = this.getConnection('writable');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            // TODO: Check assumption that worker performs internal synchronization (only one task at a time)
            return (await conn.worker.storeBatch(options)) as unknown as Promise<void>;
        } finally {
            conn.mutex.release();
        }
    }

    protected async openDatabase(mode: 'writable' | 'readonly'): Promise<IConnection> {
        const filepath = this.basePath;
        const worker = new Worker('./worker.js');
        const spawned = await spawn<WorkerDef>(worker);
        await spawned.open(filepath, mode);
        return {
            worker: spawned,
            mutex: new Mutex()
        };
    }

    protected async closeDatabase() {
        for (const conn of this.connections) {
            await conn.worker.close();
            await Thread.terminate(conn.worker);
        }
    }

    protected getConnection(mode: 'writable' | 'readonly'): IConnection {
        if (mode === 'writable') {
            return this.connections[0];
        } else {
            this.lastConnIdx++;
            const idx = 1 + (this.lastConnIdx % (this.connections.length - 1));
            return this.connections[idx];
        }
    }
}
