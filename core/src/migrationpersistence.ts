import {
    IMigrationState,
    IPersistable,
    IPersistence,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    ITablePersistence,
    ITableSearchItem,
    ITableSearchRequest,
    ITableSearchResponse
} from '@darlean/base';
import { SubPersistence, initializeFrom } from './various';
import { IMigrationController } from './migrationcontroller';

export class MigrationPersistable<T extends IMigrationState> implements IPersistable<T> {
    public value: T | undefined;
    public version?: string;

    private _changed: boolean;
    private checked: boolean;

    constructor(private superPersistable: IPersistable<T>, private controller: IMigrationController<T>) {
        this._changed = false;
        this.checked = false;
    }

    public initializeFrom(value: T) {
        const current = (this.value ?? {}) as { [key: string]: unknown };
        const changed = initializeFrom(current, value as unknown as { [key: string]: unknown });
        if (changed) {
            this.change(current as unknown as T);
        }
    }

    public change(value?: T) {
        if (value !== undefined) {
            this.value = value;
        }
        this._changed = true;
    }

    public changed() {
        return this._changed;
    }

    public clear() {
        this._changed = true;
        this.value = undefined;
    }

    public async load() {
        if (!this.checked) {
            this.checked = true;
            // Throws an error when not compatible. Otherwise, returns current migration info
            await this.controller.checkCompatibility(this.superPersistable);
            this.value = this.superPersistable.value;
            this.version = this.superPersistable.version;
            this._changed = false;
            return this.value;
        }
        const value = await this.superPersistable.load();
        this.value = value;
        this.version = this.superPersistable.version;
        this._changed = false;
        return value;
    }

    public async store(force: boolean) {
        if (force || this._changed) {
            if (this.value === undefined) {
                this.superPersistable.clear();
            } else {
                this.superPersistable.change(this.value);
            }
            const result = await this.superPersistable.store(true);
            return result;
        }
    }
}

export class MigrationPersistence<T extends IMigrationState> implements IPersistence<T> {
    constructor(private superPersistence: IPersistence<T>, private controller: IMigrationController<T>) {}

    public query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>> {
        return this.superPersistence.query(options);
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        const p = this.superPersistence.persistable(partitionKey, sortKey, value);
        return new MigrationPersistable<T>(p, this.controller);
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>> {
        const p = this.persistable(partitionKey, sortKey, undefined);
        await p.load();
        return p;
    }

    public sub(partitionKey?: string[]): IPersistence<T> {
        return new SubPersistence<T>(this, partitionKey);
    }
}

export class MigrationTablePersistence<T extends IMigrationState> implements ITablePersistence<T> {
    constructor(private superPersistence: ITablePersistence<T>, private controller: IMigrationController<T>) {}

    public search(options: ITableSearchRequest): Promise<ITableSearchResponse> {
        return this.superPersistence.search(options);
    }

    public searchChunks(options: ITableSearchRequest): AsyncGenerator<ITableSearchResponse, void> {
        return this.superPersistence.searchChunks(options);
    }

    public searchItems(options: ITableSearchRequest): AsyncGenerator<ITableSearchItem, void> {
        return this.superPersistence.searchItems(options);
    }

    public persistable(key: string[], value: T | undefined): IPersistable<T> {
        const p = this.superPersistence.persistable(key, value);
        return new MigrationPersistable<T>(p, this.controller);
    }

    public load(key: string[]): Promise<IPersistable<T>> {
        return this.superPersistence.load(key);
    }
}
