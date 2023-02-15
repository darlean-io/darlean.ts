import { ConfigRunnerBuilder } from '@darlean/core';
import { ITime, parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { StorageTestActor, STORAGE_TEST_ACTOR } from './actor.impl';

async function get_store(actor: StorageTestActor) {
    check(undefined, await actor.get(['foo'], []), 'Non existing partition key');
    check(undefined, await actor.get([], ['foo']), 'Non existing sort key');

    await actor.store(['foo'], [], 'FOO');
    check('FOO', await actor.get(['foo'], []), 'Existing sort key');
    check(undefined, await actor.get([], ['foo']), 'Still unexisting sort key (but partition key exists');

    await actor.store(['foo'], [], undefined);
    check(undefined, await actor.get(['foo'], []), 'Removed partition key');
}

async function query(actor: StorageTestActor) {
    // Add items in random order to test proper sorting of persistence layer
    await actor.store(['bar'], ['a'], 'A');
    await actor.store(['bar'], ['c', 'b'], 'C.B');
    await actor.store(['bar'], ['aa', 'b'], 'AA.B');
    await actor.store(['bar'], ['b'], 'B');
    await actor.store(['bar'], ['a', 'c'], 'A.C');
    await actor.store(['bar'], ['a', 'b'], 'A.B');

    // ASCENDING ORDER
    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: [] });
        check(
            'A A.B A.C AA.B B C.B',
            results.items.map((x) => x.value).join(' '),
            'No constraints should return all items in asc order'
        );
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'] });
        check(
            'A.C AA.B B C.B',
            results.items.map((x) => x.value).join(' '),
            'Sort key constraint should return items >= sort key in asc order'
        );
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'], sortKeyTo: ['b'] });
        check(
            'A.C AA.B B',
            results.items.map((x) => x.value).join(' '),
            'Sort key from and to should return items in that range'
        );
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'], sortKeyPrefix: ['a'] });
        check('A.C AA.B', results.items.map((x) => x.value).join(' '), 'Prefix should restrict result set');
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'], sortKeyPrefix: ['a', ''] });
        check('A.C', results.items.map((x) => x.value).join(' '), 'Prefix with empty part should restrict result set even more');
    }

    // DESCENDING ORDER
    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyOrder: 'descending' });
        check(
            'C.B B AA.B A.C A.B A',
            results.items.map((x) => x.value).join(' '),
            'Descending order constraint should return all items in desc order'
        );
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyTo: ['a'], sortKeyOrder: 'descending' });
        check(
            'A',
            results.items.map((x) => x.value).join(' '),
            'Descending order constraint should return all items less than provided sort key in desc order'
        );
    }

    {
        const results = await actor.query({ partitionKey: ['bar'], sortKeyTo: ['a', 'b'], sortKeyOrder: 'descending' });
        check(
            'A.B A',
            results.items.map((x) => x.value).join(' '),
            'Descending order constraint should return all items less than provided sort key in desc order'
        );
    }
}

async function parallel_store(actor: StorageTestActor, time: ITime) {
    const tasks: ParallelTask<void, void>[] = [];
    for (let idx = 0; idx < 10000; idx++) {
        tasks.push(async () => {
            await actor.store(['parallel', idx.toString()], [idx.toString()], idx.toString());
        });
    }
    const start = time.machineTicks();
    const results = await parallel(tasks, 100000, -1000);
    const stop = time.machineTicks();
    console.log('DURATION', stop - start, ' | ', (1000 * results.results.length) / (stop - start), 'stores/sec');
    check('completed', results.status, 'Parallel execution should be completed');
}

async function query_throughput(actor: StorageTestActor, time: ITime) {
    const tasks: ParallelTask<void, void>[] = [];
    const value = ''.padEnd(1000, '+');
    for (let idx = 0; idx < 10000; idx++) {
        tasks.push(async () => {
            const nr = (10000 + Math.round(Math.random() * 10000)).toString();
            await actor.store(['query_throughput'], [nr], value);
        });
    }
    await parallel(tasks, 100000, -1000);
    console.log('Filled');

    const start = time.machineTicks();
    const results = await actor.query({ partitionKey: ['query_throughput'], sortKeyFrom: ['13000'], sortKeyTo: ['13500'] });
    const stop = time.machineTicks();
    console.log('DURATION', stop - start);
    console.log(results.items.length);
}

async function main() {
    const builder = new ConfigRunnerBuilder();
    // builder.registerSuite(testActorSuite());
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(2500);

        const portal = runner.getPortal().typed<StorageTestActor>(STORAGE_TEST_ACTOR);
        const actor = portal.retrieve([]);

        await get_store(actor);
        await query(actor);
        await parallel_store(actor, new Time());
        await query_throughput(actor, new Time());
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
