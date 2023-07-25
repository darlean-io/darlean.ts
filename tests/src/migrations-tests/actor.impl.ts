import { action, activator, ActorSuite, IActorSuite, IMigrationContext, IMigrationState, IPersistable } from '@darlean/base';

export const MIGRATION_TEST_ACTOR = 'MigrationTestActor';

export interface IMigrationActorState extends IMigrationState {
    migrations: string[];
}

export class MigrationTestActor {
    constructor(private persistable: IPersistable<IMigrationActorState>, private mc: IMigrationContext<IMigrationActorState> | undefined) {}

    @activator()
    public async activate() {
        if (this.mc) {
            await this.mc.perform(this.persistable, async () => 'MigrationTest', { migrations: [] });
        } else {
            await this.persistable.load();
        }
    }

    @action({ locking: 'shared' })
    public async getMigrations(): Promise<string[]> {
        return this.persistable.value?.migrations ?? [];
    }

    @action()
    public async add(value: string) {
        if (this.persistable.value) {
            this.persistable.value.migrations.push(value);
            await this.persistable.store(true);
        }
    }
}

export function migrationTestActorSuite(migrations: string[] | undefined): IActorSuite {
    const suite = new ActorSuite();

    suite.addActor<MigrationTestActor, IMigrationActorState>({
        type: MIGRATION_TEST_ACTOR,
        kind: 'singular',
        creator: (context) => {
            const p = context.persistence<IMigrationActorState>().persistable(['state']);
            const mc = migrations === undefined ? undefined : context.migrationContext(undefined);
            return new MigrationTestActor(p, mc);
        },
        migrations:
            migrations?.map((m) => ({
                name: `Migration ${m}`,
                version: m,
                migrator: async (p) => {
                    console.log('Performing', m);
                    if (p.value) {
                        p.value.migrations.push(m);
                        p.change();
                    }
                }
            })) ?? undefined
    });

    return suite;
}
