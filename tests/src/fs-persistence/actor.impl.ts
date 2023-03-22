import { action, ActorSuite, IActorSuite, IPersistence, IPersistenceQueryOptions, IPersistenceQueryResult, TABLE_SERVICE } from '@darlean/base';
import { TablePersistence } from '@darlean/core';
import { ITableService } from '@darlean/tables-suite';

export const STORAGE_TEST_ACTOR = 'StorageTestActor';
export const STORAGE_TEST_ACTOR_TABLE = 'StorageTestActorTable';

export interface ITextState {
    text: string;
}

export class StorageTestActor {
    protected persistence: IPersistence<ITextState>;

    constructor(persistence: IPersistence<ITextState>) {
        this.persistence = persistence;
    }

    @action({ locking: 'shared' })
    public async store(partitionKey: string[], sortKey: string[], value: string | undefined): Promise<void> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        if (value === undefined) {
            p.clear();
        } else {
            p.change({ text: value });
        }
        await p.store();
    }

    @action({ locking: 'shared' })
    public async get(partitionKey: string[], sortKey: string[]): Promise<string | undefined> {
        const p = this.persistence.persistable(partitionKey, sortKey);
        return (await p.load())?.text;
    }

    @action({ locking: 'shared' })
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<ITextState>> {
        return this.persistence.query(options);
    }
}

export function testActorSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: STORAGE_TEST_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const p = context.persistence('storagetest') as IPersistence<ITextState>;
                return new StorageTestActor(p);
            }
        },
        {
            type: STORAGE_TEST_ACTOR_TABLE,
            kind: 'singular',
            creator: (context) => {
                const ts = context.portal.retrieve<ITableService>(TABLE_SERVICE, ['testtable']);
                const tp = new TablePersistence<ITextState>(
                    ts,
                    (item) => {
                        if (item) {
                            return [
                                {
                                    name: 'byprefix',
                                    keys: [item.text.substring(0, 2), item.text.substring(1, 3)],
                                    data: { value: 'VAL' + item.text }
                                }
                            ];
                        }
                        return [];
                    },
                    'indexstoragetest'
                );
                return new StorageTestActor(tp);
            }
        }
    ]);
}
