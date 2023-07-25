import { ConfigRunnerBuilder } from '@darlean/core';
import { sleep, Time } from '@darlean/utils';
import { MigrationTestActor, MIGRATION_TEST_ACTOR } from './actor.impl';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';

async function launchApp(instance: string, migrations: string[]) {
    cp.fork('lib/migrations-tests/app.js', [
        `--darlean-appid=app${instance}`,
        '--darlean-runtimeapps=server01,server02,server03',
        migrations.join(',')
    ]);
    await sleep(3500);
    return async () => {
        fs.rmSync(`./pid/app${instance}.run`);
        await sleep(2000);
    };
}

async function tests(actor: MigrationTestActor) {
    await context('Fill', async () => {
        const stop = await launchApp('0', []);
        await actor.add('X');
        await stop();
    });

    await context('No migrations', async () => {
        const stop = await launchApp('0', []);
        check('X', (await actor.getMigrations()).join(','), 'Initial');
        await stop();
    });

    await context('No migrations, retry', async () => {
        const stop = await launchApp('0', []);
        check('X', (await actor.getMigrations()).join(','), 'Initial');
        await stop();
    });

    await context('First migration', async () => {
        const stop = await launchApp('0', ['1.0.0']);
        check('X,1.0.0', (await actor.getMigrations()).join(','), 'Migration should be done');
        await stop();
    });

    await context('Second migration', async () => {
        const stop = await launchApp('0', ['1.0.0', '2.0.0']);
        check('X,1.0.0,2.0.0', (await actor.getMigrations()).join(','), 'Migration should be done');
        await stop();
    });

    await context('Old software version should give error', async () => {
        const stop = await launchApp('0', ['1.0.0']);
        let error: unknown;
        try {
            await actor.getMigrations();
        } catch (e) {
            error = e;
        }
        check(true, !!error, 'Old software should raise error');
        await stop();
    });

    await context('No software version should give error', async () => {
        const stop = await launchApp('0', ['none']);
        let error: unknown;
        try {
            await actor.getMigrations();
        } catch (e) {
            error = e;
        }
        check(true, !!error, 'No software version should raise error');
        await stop();
    });

    await context('Old + new software version should go fine', async () => {
        const stop0 = await launchApp('0', ['1.0.0']);
        let stop1: typeof stop0 | undefined;
        setTimeout(async () => {
            stop1 = await launchApp('1', ['1.0.0', '2.0.0']);
        }, 1000);
        check('X,1.0.0,2.0.0', (await actor.getMigrations()).join(','), 'New version should take over');
        await stop0();
        await sleep(2000);
        await stop1?.();
    });

    await context('No + new software version should go fine', async () => {
        const stop0 = await launchApp('0', ['none']);
        let stop1: typeof stop0 | undefined;
        setTimeout(async () => {
            stop1 = await launchApp('1', ['1.0.0', '2.0.0']);
        }, 1000);
        check('X,1.0.0,2.0.0', (await actor.getMigrations()).join(','), 'New version should take over');
        await stop0();
        await sleep(2000);
        await stop1?.();
    });
}

async function main() {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(2500);

        await context('tests', async () => {
            const portal = runner.getPortal().typed<MigrationTestActor>(MIGRATION_TEST_ACTOR);
            const actor = portal.retrieve([]);
            await tests(actor);
        });
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
    }
}

const contexts: string[] = [];
const time = new Time();

async function context(name: string, func: () => Promise<void>) {
    contexts.push(name);
    const start = time.machineTicks();
    await func();
    const stop = time.machineTicks();
    console.log('         Duration', name, Math.round(stop - start), 'ms');
    contexts.pop();
}

function c() {
    return contexts.length > 0 ? `[${contexts.join(' -> ')}]` : '';
}

function check<T>(expected: T, actual: T, descr: string) {
    if (expected === actual) {
        let value = actual === undefined ? 'undefined' : (actual as string).toString();
        if (value.length > 100) {
            value = value.substring(0, 100) + '...';
        }

        console.log(`[passed] ${c()} ${descr} (expected = actual = ${value})`);
    } else {
        console.log(`[FAILED] ${c()} ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
