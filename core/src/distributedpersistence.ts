import { IPersistence } from '@darlean/base';
import { IFsPersistenceService } from '@darlean/fs-persistence-suite';
import { IDeSer } from './infra/deser';
import { SubPersistence } from './various';

export class DistributedPersistence<T> implements IPersistence<T> {
    protected service: IFsPersistenceService;
    protected deser: IDeSer;

    constructor(service: IFsPersistenceService, deser: IDeSer) {
        this.service = service;
        this.deser = deser;
    }

    public async load(partitionKey?: string[], sortKey?: string[] | undefined): Promise<T | undefined> {
        const result = await this.service.load({
            partitionKey: partitionKey ?? [],
            sortKey: sortKey ?? []
        });

        if (result.value) {
            return this.deser.deserialize(result.value) as T;
        }
    }

    public async store(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T): Promise<void> {
        const v = this.deser.serialize(value);
        await this.service.store({
            partitionKey: partitionKey ?? [],
            sortKey: sortKey ?? [],
            value: v
        });
    }

    public sub(partitionKey?: string[] | undefined, sortKey?: string[] | undefined): IPersistence<T> {
        return new SubPersistence(this, partitionKey, sortKey);
    }
}
