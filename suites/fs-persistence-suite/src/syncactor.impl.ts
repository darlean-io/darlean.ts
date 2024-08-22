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
import { BufferOf, IDeSer, Mutex } from '@darlean/utils';
import { ModuleThread, spawn, Thread, Worker } from 'threads';
import { WorkerDef } from './worker';

interface IConnection {
    worker: ModuleThread<WorkerDef>;
    mutex: Mutex<void>;
    busy: boolean;
}

export class FsPersistenceActor implements IActivatable, IDeactivatable {
    private connections: IConnection[];
    private basePath: string;
    private lastConnIdx = 0;

    constructor(basePath: string, private nrReaders: number, private deser: IDeSer) {
        this.basePath = basePath;
        this.connections = [];
    }

    public async activate(): Promise<void> {
        const promises: Promise<IConnection>[] = [];
        // Ensure writer creates the folder and database before the readers try to read it.
        const writableConn = await this.openDatabase('writable');
        for (let idx = 1; idx < this.nrReaders + 1; idx++) {
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
    public async store(options: IPersistenceStoreOptions<Buffer>): Promise<void> {
        return this.storeBatchImpl({ items: [{ ...options, identifier: undefined }] });
    }

    @action({ locking: 'shared' })
    public async storeBatchBuffer(options: BufferOf<IPersistenceStoreBatchOptions<Buffer>>): Promise<void> {
        return this.storeBatchImpl(this.deser.deserializeTyped(options));
    }

    @action({ locking: 'shared' })
    public async load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult<Buffer>> {
        const conn = this.getConnection('readonly');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            conn.busy = true;
            const loadResult = await conn.worker.load(options);
            // Because of thread boundaries, the Buffer value in loadResult is replaced
            // with a byte-array. So, create a new Buffer around this.
            return {
                version: loadResult.version,
                value: loadResult.value ? Buffer.from(await loadResult.value.arrayBuffer()) : undefined
            };
        } finally {
            conn.busy = false;
            conn.mutex.release();
        }
    }

    @action({ locking: 'shared' })
    public async queryBuffer(options: IPersistenceQueryOptions): Promise<BufferOf<IPersistenceQueryResult<Buffer>>> {
        const conn = this.getConnection('readonly');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            conn.busy = true;
            const queryResults = await conn.worker.query(options);
            const result: IPersistenceQueryResult<Buffer> = {
                items: [],
                continuationToken: queryResults.continuationToken
            };
            for (const item of queryResults.items) {
                result.items.push({
                    sortKey: item.sortKey,
                    value: item.value ? Buffer.from(await item.value.arrayBuffer()) : undefined
                });
            }
            return this.deser.serialize(result);
        } finally {
            conn.busy = false;
            conn.mutex.release();
        }
    }

    protected async storeBatchImpl(options: IPersistenceStoreBatchOptions<Buffer>): Promise<void> {
        // TODO: Combine multiple batches internally
        const conn = this.getConnection('writable');
        if (!conn) {
            throw new Error('No connection');
        }
        conn.mutex.tryAcquire() || (await conn.mutex.acquire());
        try {
            conn.busy = true;
            // TODO: Check assumption that worker performs internal synchronization (only one task at a time)
            const options2: IPersistenceStoreBatchOptions<Blob> = {
                items: options.items.map((item) => ({
                    identifier: item.identifier,
                    partitionKey: item.partitionKey,
                    version: item.version,
                    sortKey: item.sortKey,
                    specifier: item.specifier,
                    value: item.value ? new Blob([item.value]) : undefined
                }))
            };
            return (await conn.worker.storeBatch(options2)) as unknown as Promise<void>;
        } finally {
            conn.busy = false;
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
            mutex: new Mutex(),
            busy: false
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
            let idx = 0;
            for (let offset = 0; offset < this.connections.length - 1; offset++) {
                this.lastConnIdx++;
                idx = 1 + (this.lastConnIdx % (this.connections.length - 1));
                if (!this.connections[idx].busy) {
                    break;
                }
            }
            return this.connections[idx];
        }
    }
}
