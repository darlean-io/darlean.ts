import { action, ActorSuite, IActorSuite, IPersistence } from '@darlean/base';

export const STORAGE_TEST_ACTOR = 'StorageTestActor';

export class StorageTestActor {
    protected persistence: IPersistence<string>;

    constructor(persistence: IPersistence<string>) {
        this.persistence = persistence;
    }

    @action()
    public async store(partitionKey: string[], sortKey: string[], value: string | undefined): Promise<void> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        if (value === undefined) {
            p.clear();
        } else {
            p.change(value);
        }
        await p.store();
    }

    @action()
    public async get(partitionKey: string[], sortKey: string[]): Promise<string | undefined> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        return await p.load();
    }
}

export default function suite(): IActorSuite {
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
