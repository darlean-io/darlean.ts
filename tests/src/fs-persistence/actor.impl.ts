import { action, ActorSuite, IActorSuite, IPersistence, IPersistenceQueryOptions, IPersistenceQueryResult } from '@darlean/base';

export const STORAGE_TEST_ACTOR = 'StorageTestActor';

export class StorageTestActor {
    protected persistence: IPersistence<string>;

    constructor(persistence: IPersistence<string>) {
        this.persistence = persistence;
    }

    @action({ locking: 'shared' })
    public async store(partitionKey: string[], sortKey: string[], value: string | undefined): Promise<void> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        if (value === undefined) {
            p.clear();
        } else {
            p.change(value);
        }
        await p.store();
    }

    @action({ locking: 'shared' })
    public async get(partitionKey: string[], sortKey: string[]): Promise<string | undefined> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        return await p.load();
    }

    @action({ locking: 'shared' })
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<string>> {
        return this.persistence.query(options);
    }
}

export function testActorSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: STORAGE_TEST_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const p = context.persistence('storagetest') as IPersistence<string>;
                return new StorageTestActor(p);
            }
        }
    ]);
}
