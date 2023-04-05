import { action, ActorSuite, IActorSuite, IPersistenceQueryOptions, IPersistenceQueryResult, ITablePersistence, ITableService, TABLES_SERVICE } from '@darlean/base';
import { TablePersistence } from '@darlean/core';

export const STORAGE_TEST_ACTOR_TABLE = 'StorageTestActorTable';

export interface ITextState {
    text: string;
}

export class TableStorageTestActor {
    protected persistence: ITablePersistence<ITextState>;

    constructor(persistence: ITablePersistence<ITextState>) {
        this.persistence = persistence;
    }

    @action({ locking: 'shared' })
    public async store(partitionKey: string[], sortKey: string[], value: string | undefined): Promise<void> {
        const p = this.persistence.persistable([...partitionKey, ...sortKey], undefined);
        if (value === undefined) {
            p.clear();
        } else {
            p.change({ text: value });
        }
        await p.store();
    }

    @action({ locking: 'shared' })
    public async get(partitionKey: string[], sortKey: string[]): Promise<string | undefined> {
        const p = this.persistence.persistable([...partitionKey, ...sortKey], undefined);
        return (await p.load())?.text;
    }

    @action({ locking: 'shared' })
    public async query(_options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<ITextState>> {
        throw new Error('Unupported operation: query');
    }
}

export function testActorSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: STORAGE_TEST_ACTOR_TABLE,
            kind: 'singular',
            creator: (context) => {
                const ts = context.portal.retrieve<ITableService>(TABLES_SERVICE, ['testtable']);
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
                return new TableStorageTestActor(tp);
            }
        }
    ]);
}
