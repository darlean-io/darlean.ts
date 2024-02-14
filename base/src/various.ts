/* eslint-disable @typescript-eslint/ban-types */
import { IInstanceWrapper } from './instances';
import { IPersistenceQueryOptions, IPersistenceQueryResult } from './services/persistence';
import { ITableSearchItem, ITableSearchRequest, ITableSearchResponse } from './services/tables';
import { Changeable, IChangeable } from '@darlean/utils';

/**
 * Represents something that can be loaded and persisted.
 *
 * Note: This interface is called `IPersistablePure` to have no naming conflict with the {@IPersistable} interface
 * which is used a lot by application code so deserves to have the short name `IPersistable`.
 */
export interface IPersistablePure<T> {
    /**
     * Returns the last known version of the persistable, or undefined when the version is not yet known.
     */
    getVersion(): string | undefined;

    /**
     * Loads the value from the underlying persistence store.
     * @param whenNotPresent Defines what should happen when the underlying store does not have a
     * value. The default is `'keep'`, which keeps the existing value (see remarks). It can also
     * be set to `'clear'` which clears the value.
     * @returns The loaded value
     * @Remarks When the store does not return a value, `load` returns `undefined`, but the internal value
     * is not adjusted (still has the old value). This makes it easy to
     * provide an {@link IPersistable} with a default initial value, then call {@link load}, and when
     * no data was yet present in the store, the earlier assigned default value is still present. To
     * alter this behaviour, set whenUndefined to `'clear'`, which will clear the internal value.
     */
    load(whenNotPresent?: 'keep' | 'clear'): Promise<T | undefined>;

    /**
     * Stores the value in the underlying persistence store.
     * @param condition When `dirty`, only store the value when it is marked as dirty (default). When `always`,
     * the store is also performed when the value is not changed.
     */
    persist(condition?: 'dirty' | 'always'): Promise<void>;
}

/**
 * Represents a value that can be loaded, changed and persisted.
 */
export interface IPersistable<T> extends IChangeable<T>, IPersistablePure<T> {
    /**
     * Returns the last known version of the persistable, or undefined when the version is not yet known.
     */
    getVersion(): string | undefined;

    /**
     * Loads the value from the underlying persistence store.
     * @param whenNotPresent Defined what should happen when the underlying store does not have a
     * value. The default is `'keep'`, which keeps the existing value (see remarks). It can also
     * be set to `'clear'` which clears the value.
     * @returns The loaded value
     * @Remarks When the store does not return a value, `load` returns `undefined`, but the internal value
     * is not adjusted (still has the old value). This makes it easy to
     * provide an {@link IPersistable} with a default initial value, then call {@link load}, and when
     * no data was yet present in the store, the earlier assigned default value is still present. To
     * alter this behaviour, set whenUndefined to `'clear'`, which will clear the internal value.
     */
    load(whenNotPresent?: 'keep' | 'clear'): Promise<T | undefined>;

    /**
     * Stores the value in the underlying persistence store.
     * @param condition When `dirty`, only store the value when it is marked as dirty (default). When `always`,
     * the store is also performed when the value is not changed.
     */
    persist(condition?: 'dirty' | 'always'): Promise<void>;
}

/**
 * Interface to persistent storage that can be used to load and store values persistently.
 */
export interface IPersistence<T> {
    /**
     * Returns a new {@link IPersistable} instance with the provided partition key, sort key and
     * initial value.
     * @param partitionKey The partition key that will be used for later load and store actions
     * @param sortKey The sort key that will be used for later load and store actions
     * @param value The initial value that is assigned to {@IPersistable.value}.
     * @remarks This method just returns a new {@link IPersistence} with an optional default value set; it does
     * *not* perform and {@link load}ing of the data from the persistence store. For that, use {@link load}.
     */
    persistable(partitionKey?: string[], sortKey?: string[], value?: T): IPersistable<T>;

    /**
     * Creates a new {@link IPersistable} instance with the provided partition and sort key, and
     * loads the most recent value from the persistence store.
     * @param partitionKey The partition key that will be used for this and later load and store actions
     * @param sortKey The sort key that will be used for this and later load and store actions
     */
    load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>>;

    /**
     * Returns a new sub-persistence interface with the provided partition key added
     * to the partition of the current instance.
     * @param partitionKey The partition key fields that will be added to the existing partition key fields.
     * Must be `undefined` or `[]` when the current instance already has a sort key assigned.
     */
    sub(partitionKey?: string[]): IPersistence<T>;

    /**
     * Performs a query with the provided options.
     * @param options
     */
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>>;
}

//----- Table persistence -------

/**
 * Persistence that uses a Darlean Table as underlying storage. The interface is different from the similar
 * {@link IPersistence}, but the returned {@link IPersistable} instances from the {@link persistable} and {@link load}
 * methods are compatible.
 */
export interface ITablePersistence<T> {
    /**
     * Searches in the underlying table with the provided options.
     */
    search(options: ITableSearchRequest): Promise<ITableSearchResponse>;
    /**
     * Convenience wrapper around {@link search} that returns an asynchronous iterator that can be used
     * to iterate over the result chunks.
     */
    searchChunks(options: ITableSearchRequest): AsyncGenerator<ITableSearchResponse, void>;
    /**
     * Convenience wrapper around {@link search} that returns an asynchronous iterator that can be used
     * to iterate over the individual result items.
     */
    searchItems(options: ITableSearchRequest): AsyncGenerator<ITableSearchItem, void>;
    /**
     * Returns a new {@link IPersistable} instance with the key and initial value.
     * @remarks This method just returns a new {@link IPersistence} with an optional default value set; it does
     * *not* perform and loading of the data from the persistence store. For that, use {@link load} or {@link IPersistable.load}.
     */
    persistable(key: string[], value: T | undefined): IPersistable<T>;
    /**
     * Creates a new {@link IPersistable} instance with the provided key, and
     * loads the most recent value from the persistence store.
     */
    load(key: string[]): Promise<IPersistable<T>>;
}

//----- Volatile timers -------

export interface IVolatileTimerHandle {
    cancel(): void;
    pause(duration?: number): void;
    resume(delay?: number): void;
}

export type VolatileTimerFactory<T extends object> = (wrapper: IInstanceWrapper<T>) => IVolatileTimer;

export interface IVolatileTimer {
    once(handler: Function, delay: number, args?: unknown): IVolatileTimerHandle;
    repeat(handler: Function, interval: number, delay?: number, nrRepeats?: number, args?: unknown): IVolatileTimerHandle;
}

export interface IMigrationDefinition<OldState extends IMigrationState = IMigrationState, Context = unknown> {
    version: string;
    name: string;
    migrator: (persistable: IPersistable<OldState>, context: Context) => Promise<Context | void>;
}

export interface IMigrationState {
    migrationInfo: string;
}

export interface IMigrationContext<T extends IMigrationState = IMigrationState, Context = unknown> {
    perform(state: IPersistable<T>, nameResolver: () => Promise<string>, defaultValue: T): Promise<Context>;
}

/**
 * Base class for creating custom persistables.
 */
export abstract class CustomPersistable<T> extends Changeable<T> implements IPersistable<T> {
    private _version?: string | undefined;

    constructor(value: T | undefined, dirty = true) {
        super(value, dirty);
    }

    public getVersion(): string | undefined {
        return this._version;
    }

    public async load(whenUndefined?: 'keep' | 'clear'): Promise<T | undefined> {
        const result = await this._load();
        this._version = result.version;
        if (result.value === undefined) {
            if (whenUndefined === 'clear') {
                this.setClear();
            }
        } else {
            this.setValue(result.value);
        }
        this.markDirty(false);
        return result.value;
    }

    public async persist(condition?: 'dirty' | 'always'): Promise<void> {
        if (condition !== 'always' && !this.isDirty()) {
            return;
        }

        let version = this._version;
        if (version) {
            const next = parseInt(this._version || '0') + 1;
            version = next.toString().padStart(20, '0');
            this._version = version;
        } else {
            const next = Date.now();
            version = next.toString().padStart(20, '0');
            this._version = version;
        }

        await this._persist(this.tryGetValue(), version);
        this.markDirty(false);
    }

    protected setVersion(version: string | undefined) {
        this._version = version;
    }

    protected abstract _load(): Promise<{ value: T | undefined; version?: string }>;
    protected abstract _persist(value: T | undefined, version: string): Promise<void>;
}
