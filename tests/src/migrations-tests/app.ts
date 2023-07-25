import { ConfigRunnerBuilder } from '@darlean/core';
import { migrationTestActorSuite } from './actor.impl';

async function main(migrations: string[] | undefined) {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(migrationTestActorSuite(migrations));
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    let migrations: string[] | undefined = process.argv[process.argv.length - 1]?.split(',') ?? [];
    if (migrations[0] === 'none') {
        migrations = undefined;
    }
    main(migrations)
        .then()
        .catch((e) => console.log(e));
}
