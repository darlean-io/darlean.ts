import { ConfigRunnerBuilder } from '@darlean/core';
import { StorageTestActor, STORAGE_TEST_ACTOR } from './actor.impl';

async function main() {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        const portal = runner.getPortal().typed<StorageTestActor>(STORAGE_TEST_ACTOR);
        const actor = portal.retrieve([]);

        check(undefined, await actor.get(['foo'], []), 'Non existing partition key');
        check(undefined, await actor.get([], ['foo']), 'Non existing sort key');

        await actor.store(['foo'], [], 'FOO');
        check('FOO', await actor.get(['foo'], []), 'Existing sort key');
        check(undefined, await actor.get([], ['foo']), 'Still unexisting sort key (but partition key exists');

        await actor.store(['foo'], [], undefined);
        check(undefined, await actor.get(['foo'], []), 'Removed partition key');
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
    }
}

function check(expected: string | undefined, actual: string | undefined, descr: string) {
    if (expected === actual) {
        console.log(`PASSED ${descr} (expected = actual = ${actual})`);
    } else {
        console.log(`FAILED ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
