import { IPersistenceQueryResult, IQueryItem } from '@darlean/base';
import { ConfigRunnerBuilder } from '@darlean/core';
import { ITime, parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { ITextState, StorageTestActor, STORAGE_TEST_ACTOR, testActorSuite } from './actor.impl';

async function distributedpersistence_get_store(actor: StorageTestActor) {
    check(undefined, await actor.get(['foo'], []), 'Non existing partition key');
    check(undefined, await actor.get([], ['foo']), 'Non existing sort key');

    await actor.store(['foo'], [], 'FOO');
    check('FOO', await actor.get(['foo'], []), 'Existing sort key');
    check(undefined, await actor.get([], ['foo']), 'Still unexisting sort key (but partition key exists');

    await actor.store(['foo'], [], undefined);
    check(undefined, await actor.get(['foo'], []), 'Removed partition key');
}

async function distributedpersistence_query(actor: StorageTestActor) {
    // Add items in random order to test that persistence layer performs proper sorting
    await actor.store(['bar'], ['a'], 'A');
    await actor.store(['bar'], ['c', 'b'], 'C.B');
    await actor.store(['bar'], ['aa', 'b'], 'AA.B');
    await actor.store(['bar'], ['b'], 'B');
    await actor.store(['bar'], ['a', 'c'], 'A.C');
    await actor.store(['bar'], ['a', 'b'], 'A.B');

    // The correct sorted order is: A, A.B, A.C, AA.B, B, C.B

    for (const order of ['ascending', 'descending']) {
        const transform: (value: string) => string = order === 'ascending' ? (v) => v : (v) => v.split(' ').reverse().join(' ');
        const sortKeyOrder = order === 'ascending' ? undefined : 'descending';

        await context(order, async () => {
            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyOrder });
                check(transform('A A.B A.C AA.B B C.B'), results.items.map((x) => x.value?.text).join(' '), 'No constraints should return all items');
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: [], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    'Empty sort key from array should return all items'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: [''], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    'Empty string in sortKeyFrom array constraints should return all items'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a'], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    "Sort key constraint should return items >= sort key constraint, including items that have a prefix map (like 'AA')"
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'], sortKeyOrder });
                check(
                    transform('A.C AA.B B C.B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    'Sort key constraint should return items >= sort key'
                );
            }

            {
                const results = await actor.query({
                    partitionKey: ['bar'],
                    sortKeyFrom: ['a', 'c'],
                    sortKeyTo: ['b'],
                    sortKeyOrder
                });
                check(
                    transform('A.C AA.B B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    'Sort key from and to should return items in that range'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyTo: ['a'], sortKeyOrder });
                check(
                    transform('A A.B A.C'),
                    results.items.map((x) => x.value?.text).join(' '),
                    "Sort key to should return items <= the constraint including children (like 'A.B') but not prefix items like 'AA'"
                );
            }

            {
                const results = await actor.query({
                    partitionKey: ['bar'],
                    sortKeyTo: ['a'],
                    sortKeyToMatch: 'loose',
                    sortKeyOrder
                });
                check(
                    transform('A A.B A.C AA.B'),
                    results.items.map((x) => x.value?.text).join(' '),
                    'Loose sort key to should also return prefix items'
                );
            }
        });
    }
}

async function distributedpersistence_parallel_store(actor: StorageTestActor, time: ITime) {
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

async function distributedpersistence_query_throughput(actor: StorageTestActor, time: ITime) {
    const tasks: ParallelTask<void, void>[] = [];
    const value = ''.padEnd(1000, '+');

    await context('random-insert', async () => {
        // Inserts 10.000 records with key and value randomly between 10.000 and 20.000.
        for (let idx = 0; idx < 10000; idx++) {
            tasks.push(async () => {
                const nr = (10000 + Math.round(Math.random() * 10000)).toString();
                await actor.store(['query_throughput'], [nr], value);
            });
        }
        await parallel(tasks, 100000, -1000);
    });

    const ascdescItems: string[][] = [[], []];

    for (const direction of ['ascending', 'descending']) {
        await context(direction, async () => {
            const start = time.machineTicks();
            const items: IQueryItem<ITextState>[] = [];
            let n = 0;
            let results: IPersistenceQueryResult<ITextState> | undefined;
            while (results === undefined || results?.continuationToken) {
                results = await actor.query({
                    partitionKey: ['query_throughput'],
                    sortKeyFrom: ['13000'],
                    sortKeyTo: ['16000'],
                    continuationToken: results?.continuationToken,
                    sortKeyOrder: direction as 'ascending' | 'descending'
                });
                n++;
                for (const item of results.items) {
                    items.push(item);
                }
            }
            const stop = time.machineTicks();
            check(true, n > 1, 'Result set must have at least one continuation token');
            check(true, items.length > 1000, 'Result set must return a lot of items');
            console.log('DURATION', stop - start, 'ms');
            const idx = direction === 'ascending' ? 0 : 1;
            for (const item of items) {
                ascdescItems[idx].push(item.sortKey[0]);
            }
        });
    }

    check(JSON.stringify(ascdescItems[0]), JSON.stringify(ascdescItems[0].sort()), 'Items should be properly sorted');
    check(JSON.stringify(ascdescItems[0]), JSON.stringify(ascdescItems[1].reverse()), 'Asc and desc should return same data, but in reverse order');

    await context('Multi-chunk', async () => {
        let n = 0;
        let results: IPersistenceQueryResult<ITextState> | undefined;
        const items: IQueryItem<ITextState>[] = [];
        while (true) {
            results = await actor.query({
                partitionKey: ['query_throughput'],
                sortKeyFrom: ['13000'],
                sortKeyTo: ['16000'],
                continuationToken: results?.continuationToken,
                maxItems: 10
            });
            n++;
            for (const item of results.items) {
                items.push(item);
            }
            if (!results.continuationToken) {
                break;
            }
        }
        check(true, n > 10, 'Result set must have quite some continuation tokens');
        check(true, items.length > 1000, 'Result set must return a lot of items');
        check(JSON.stringify(ascdescItems[0]), JSON.stringify(items.map((x) => x.sortKey[0])), 'All items should be present in the proper order');
    });
}

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(testActorSuite());
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(2500);

        await context('distributed-persistence', async () => {
            const portal = runner.getPortal().typed<StorageTestActor>(STORAGE_TEST_ACTOR);
            const actor = portal.retrieve([]);
            await distributedpersistence_get_store(actor);
            await distributedpersistence_query(actor);
            await distributedpersistence_parallel_store(actor, new Time());
            await distributedpersistence_query_throughput(actor, new Time());
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
