import {
    IPersistable,
    IPersistence,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceService,
    IQueryItem
} from '@darlean/base';
import { IDeSer } from '@darlean/utils';
import { SubPersistence } from './various';

/**
 * For internal use. Helper class for {@link DistributedPersistence}.
 */
class DistributedPersistable<T> implements IPersistable<T> {
    private _changed = false;
    private persistence: DistributedPersistence<T>;
    private partitionKey: string[] | undefined;
    private sortKey: string[] | undefined;

    public value?: T | undefined;
    public version: string | undefined;

    constructor(
        persistence: DistributedPersistence<T>,
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined
    ) {
        this.persistence = persistence;
        this.partitionKey = partitionKey;
        this.sortKey = sortKey;
        this.value = value;
    }

    public async load(): Promise<T | undefined> {
        const result = await this.persistence.loadImpl(this.partitionKey, this.sortKey);
        if (result[0] !== undefined) {
            this.value = result[0];
        }
        this.version = result[1];
        this._changed = false;
        return result[0];
    }

    public async store(force?: boolean): Promise<void> {
        if (!force) {
            if (!this._changed) {
                return;
            }
        }

        if (this.version) {
            const next = parseInt(this.version || '0') + 1;
            this.version = next.toString().padStart(20, '0');
        } else {
            const next = Date.now();
            this.version = next.toString().padStart(20, '0');
        }
        await this.persistence.storeImpl(this.partitionKey, this.sortKey, this.value, this.version);
        this._changed = false;
    }

    public change(value: T | undefined): void {
        if (value !== undefined) {
            this.value = value;
        }
        this._changed = true;
    }

    public clear(): void {
        this.value = undefined;
        this._changed = true;
    }

    changed(): boolean {
        return this._changed;
    }
}

/**
 * Implementation of {@link IPersistence} that uses a distributed persistence service (like the one defined
 * in {@link @darlean/fs-persistence-suite}) to provide persistency.
 */
export class DistributedPersistence<T> implements IPersistence<T> {
    private service: IPersistenceService;
    private deser: IDeSer;
    private specifier: string | undefined;

    constructor(service: IPersistenceService, deser: IDeSer, specifier?: string) {
        this.service = service;
        this.deser = deser;
        this.specifier = specifier;
    }

    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>> {
        const intermediate = await this.service.query({
            specifier: this.specifier,
            partitionKey: options.partitionKey,
            sortKeyFrom: options.sortKeyFrom,
            sortKeyTo: options.sortKeyTo,
            sortKeyToMatch: options.sortKeyToMatch,
            maxItems: options.maxItems,
            continuationToken: options.continuationToken,
            sortKeyOrder: options.sortKeyOrder
        });

        const results: IPersistenceQueryResult<T> = {
            continuationToken: intermediate.continuationToken,
            items: []
        };

        for (const item of intermediate.items) {
            const item2: IQueryItem<T> = {
                sortKey: item.sortKey,
                value: item.value ? (this.deser.deserialize(item.value) as T) : undefined
            };
            results.items.push(item2);
        }

        return results;
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        return new DistributedPersistable(this, partitionKey, sortKey, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[] | undefined): Promise<IPersistable<T>> {
        const result = this.persistable(partitionKey, sortKey, undefined);
        await result.load();
        return result;
    }

    public async loadImpl(
        partitionKey?: string[],
        sortKey?: string[] | undefined
    ): Promise<[value: T | undefined, version: string | undefined]> {
        const result = await this.service.load({
            specifier: this.specifier,
            partitionKey: partitionKey ?? [],
            sortKey: sortKey ?? []
        });

        const value = result.value ? (this.deser.deserialize(result.value) as T) : undefined;

        return [value, result.version];
    }

    public async storeImpl(
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined,
        version: string
    ): Promise<void> {
        const v = value === undefined ? undefined : this.deser.serialize(value);
        await this.service.store({
            specifier: this.specifier,
            partitionKey: partitionKey ?? [],
            sortKey: sortKey ?? [],
            value: v,
            version: version
        });
    }

    public sub(partitionKey?: string[] | undefined): IPersistence<T> {
        return new SubPersistence(this, partitionKey);
    }
}
