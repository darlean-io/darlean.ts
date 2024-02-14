import {
    CustomPersistable,
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
import { SubPersistence } from './various';
import { IMigrationController } from './migrationcontroller';

export class MigrationPersistable<T extends IMigrationState> extends CustomPersistable<T> implements IPersistable<T> {
    private checked: boolean;

    constructor(private superPersistable: IPersistable<T>, private controller: IMigrationController<T>) {
        super(undefined);
        this.checked = false;
    }

    protected async _load(): Promise<{ value: T | undefined; version: string | undefined }> {
        if (!this.checked) {
            this.checked = true;
            // Throws an error when not compatible. Otherwise, returns current migration info
            await this.controller.checkCompatibility(this.superPersistable);
            this.setVersion(this.superPersistable.getVersion());
            return { value: this.superPersistable.tryGetValue(), version: this.getVersion() };
        }
        const value = await this.superPersistable.load();
        this.setVersion(this.superPersistable.getVersion());
        return { value, version: this.getVersion() };
    }

    protected async _persist(value: T | undefined) {
        if (value === undefined) {
            this.superPersistable.clear();
        } else {
            this.controller.enforceMigrationInfoOnState(value);
            this.superPersistable.change(value);
        }
        const result = await this.superPersistable.persist('always');
        return result;
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
