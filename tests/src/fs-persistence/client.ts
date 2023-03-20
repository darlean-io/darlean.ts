import { IPortal, TABLE_SERVICE } from '@darlean/base';
import { ConfigRunnerBuilder, TablePersistence } from '@darlean/core';
import { IIndexItem, ITableService, ITableSearchResponse } from '@darlean/tables-suite';
import { encodeNumber, ITime, parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { StorageTestActor, STORAGE_TEST_ACTOR, STORAGE_TEST_ACTOR_TABLE, testActorSuite } from './actor.impl';

async function distributedpersistence_get_store(actor: StorageTestActor) {
    check(undefined, await actor.get(['foo'], []), 'Non existing partition key');
    check(undefined, await actor.get([], ['foo']), 'Non existing sort key');

    await actor.store(['foo'], [], 'FOO');
    check('FOO', await actor.get(['foo'], []), 'Existing sort key');
    check(undefined, await actor.get([], ['foo']), 'Still unexisting sort key (but partition key exists');

    await actor.store(['foo'], [], undefined);
    check(undefined, await actor.get(['foo'], []), 'Removed partition key');
}

async function tablepersistence_get_store(actor: StorageTestActor) {
    check(undefined, await actor.get(['foo'], []), 'TABLE: Non existing partition key');
    check(undefined, await actor.get([], ['foo']), 'TABLE: Non existing sort key');

    await actor.store(['foo'], [], 'FOO');
    check('FOO', await actor.get(['foo'], []), 'TABLE: Existing sort key');
    check(undefined, await actor.get([], ['foo']), 'TABLE: Still unexisting sort key (but partition key exists');

    await actor.store(['foo'], [], undefined);
    check(undefined, await actor.get(['foo'], []), 'TABLE: Removed partition key');
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
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value).join(' '),
                    'No constraints should return all items'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: [], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value).join(' '),
                    'Empty sort key from array should return all items'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: [''], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value).join(' '),
                    'Empty string in sortKeyFrom array constraints should return all items'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a'], sortKeyOrder });
                check(
                    transform('A A.B A.C AA.B B C.B'),
                    results.items.map((x) => x.value).join(' '),
                    "Sort key constraint should return items >= sort key constraint, including items that have a prefix map (like 'AA')"
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyFrom: ['a', 'c'], sortKeyOrder });
                check(
                    transform('A.C AA.B B C.B'),
                    results.items.map((x) => x.value).join(' '),
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
                    results.items.map((x) => x.value).join(' '),
                    'Sort key from and to should return items in that range'
                );
            }

            {
                const results = await actor.query({ partitionKey: ['bar'], sortKeyTo: ['a'], sortKeyOrder });
                check(
                    transform('A A.B A.C'),
                    results.items.map((x) => x.value).join(' '),
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
                    results.items.map((x) => x.value).join(' '),
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

async function tablepersistence_store_search(actor: StorageTestActor, time: ITime, portal: IPortal) {
    const tasks: ParallelTask<void, void>[] = [];
    for (let idx = 0; idx < 10000; idx++) {
        tasks.push(async () => {
            await actor.store(['idxtest'], [idx.toString()], idx.toString());
        });
    }
    const start = time.machineTicks();
    const results = await parallel(tasks, 100000, -1000);
    const stop = time.machineTicks();
    console.log('DURATION', stop - start, ' | ', (1000 * results.results.length) / (stop - start), 'stores/sec');

    const ts = portal.retrieve<ITableService>(TABLE_SERVICE, ['testtable']);
    const tp = new TablePersistence<string>(ts, () => [], ['indexstoragetest']);

    {
        const results = await tp.search({
            partitionKey: ['idxtest'],
            keys: [{ operator: 'prefix', value: '12' }]
        });
        console.log('PREFIX-12', results.items);
        check(
            '12',
            ((results.items[0].tableFields as unknown as string) ?? '').substring(0, 2),
            'Prefix query must return prefix results'
        );
    }

    check('completed', results.status, 'Parallel execution should be completed');
}

async function distributedpersistence_query_throughput(actor: StorageTestActor, time: ITime) {
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
    console.log('DURATION', stop - start, 'ms');
    console.log(results.items.length);
}

async function table(portal: IPortal) {
    const service = portal.retrieve<ITableService>(TABLE_SERVICE, ['MyTable']);
    const item = await service.get({
        keys: ['123', '4'],
        specifiers: ['table']
    });
    const item2 = await service.put({
        specifiers: ['table'],
        baseline: item.baseline,
        id: ['123', '4'],
        version: '1000',
        data: { Hello: 'World' },
        indexes: [
            { name: 'a', keys: ['45'], data: { hello: 'world' } },
            { name: 'b', keys: ['ab', 'cd'] }
        ]
    });
    console.log('ITEM2', JSON.stringify(item2));
    const items2 = await service.search({
        index: 'a',
        specifiers: ['table'],
        keys: []
    });
    console.log('ITEMS2', JSON.stringify(items2));
    const items2a = await service.search({
        index: 'b',
        specifiers: ['table'],
        keys: [{ operator: 'eq', value: 'ab' }]
    });
    console.log('ITEMS2a', JSON.stringify(items2a));
    const items2b = await service.search({
        specifiers: ['table'],
        keys: [{ operator: 'eq', value: '123' }]
    });
    console.log('ITEMS2b', JSON.stringify(items2b));

    const item3 = await service.put({
        specifiers: ['table'],
        baseline: item2.baseline,
        id: ['123', '4'],
        version: '1001',
        data: { Hello: 'Moon' },
        indexes: [{ name: 'a', keys: ['45'], data: { hello: 'moon' } }]
    });
    console.log('ITEM3', JSON.stringify(item3));
    const items3 = await service.search({
        index: 'a',
        specifiers: ['table'],
        keys: []
    });
    console.log('ITEMS3', JSON.stringify(items3));

    const item4 = await service.get({
        keys: ['123', '4'],
        specifiers: ['table']
    });
    console.log('ITEM4', JSON.stringify(item4));
}

async function table2(portal: IPortal) {
    interface ISong {
        title: string;
        artist: string;
        album: string;
    }

    function indexer(data: ISong): IIndexItem[] {
        return [
            { name: 'byArtist', keys: [data.artist], data: { title: data.title } },
            { name: 'byAlbum', keys: [data.album], data: { title: data.title } }
        ];
    }

    const service = portal.retrieve<ITableService>(TABLE_SERVICE, ['SongsTable']);
    const specifiers = ['table.songs'];
    let version = 0;

    async function put(song: ISong, baseline: string | undefined) {
        await service.put({
            specifiers,
            baseline,
            id: [song.title],
            indexes: indexer(song),
            data: { title: song.title, artist: song.artist, album: song.album },
            version: encodeNumber(version++)
        });
    }

    const songs = [
        { title: 'Killer Queen', artist: 'Queen', album: 'Sheer Heart Attack' },
        { title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera' },
        { title: "You're my best friend", artist: 'Queen', album: 'A Night at the Opera' },
        { title: 'Hey Jude', artist: 'The Beatles', album: 'Hey Jude' },
        { title: "Won't get fooled again", artist: 'The Who', album: "Who's Next" },
        { title: 'Who are you', artist: 'The Who', album: 'Who are you' }
    ];

    for (const song of songs) {
        await put(song, undefined);
    }

    /// Queries on base table
    await context('BaseTable', async () => {
        function checkTitles(expected: string[], response: ITableSearchResponse, msg: string) {
            check(expected.length, response.items.length, `${msg}: Record count should match`);
            for (let idx = 0; idx < expected.length; idx++) {
                check(
                    expected[idx],
                    (response.items[idx].tableFields as ISong | undefined)?.title ?? 'undefined',
                    `${msg}: Record ${idx} should match`
                );
            }
        }

        await context('PointQuery', async () => {
            const bohemian = await service.get({ keys: ['Bohemian Rhapsody'], specifiers });
            check('Bohemian Rhapsody', (bohemian.data as ISong | undefined)?.title, 'Fields should be ok');
            check('Queen', (bohemian.data as ISong | undefined)?.artist, 'Fields should be ok');
        });

        await context('PointSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'eq', value: 'Killer Queen' }], specifiers });
            checkTitles(['Killer Queen'], response, 'Point search should return all fields');
            check(
                'Sheer Heart Attack',
                (response.items[0].tableFields as ISong | undefined)?.album,
                'Point search should fill in all fields'
            );
        });

        await context('PointSearchNotPrefix', async () => {
            const response = await service.search({ keys: [{ operator: 'eq', value: 'Killer' }], specifiers });
            checkTitles([], response, 'Point search should only return full matches');
        });

        await context('GTESearch', async () => {
            const response = await service.search({ keys: [{ operator: 'gte', value: 'Killer Queen' }], specifiers });
            checkTitles(
                ['Killer Queen', 'Who are you', "Won't get fooled again", "You're my best friend"],
                response,
                'GTE Search'
            );
        });

        await context('GTESearchDescending', async () => {
            const response = await service.search({
                keys: [{ operator: 'gte', value: 'Killer Queen' }],
                keysOrder: 'descending',
                specifiers
            });
            checkTitles(
                ["You're my best friend", "Won't get fooled again", 'Who are you', 'Killer Queen'],
                response,
                'GTE Search Descending'
            );
        });

        await context('LTESearch', async () => {
            const response = await service.search({ keys: [{ operator: 'lte', value: 'Killer Queen' }], specifiers });
            checkTitles(['Bohemian Rhapsody', 'Hey Jude', 'Killer Queen'], response, 'LTE Search');
        });

        await context('BetweenSearch', async () => {
            const response = await service.search({
                keys: [{ operator: 'between', value: 'Killer Queen', value2: "Won't get fooled again" }],
                specifiers
            });
            checkTitles(['Killer Queen', 'Who are you', "Won't get fooled again"], response, 'Between Search');
        });

        await context('PrefixSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'prefix', value: 'W' }], specifiers });
            checkTitles(['Who are you', "Won't get fooled again"], response, 'Prefix Search');
        });

        await context('KeyFilterSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'contains', value: 'fooled' }], specifiers });
            checkTitles(["Won't get fooled again"], response, 'Key Filter Search');
        });

        await context('DataFilterSearch', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifiers
            });
            checkTitles(['Bohemian Rhapsody', "You're my best friend"], response, 'Key Filter Search');
        });

        await context('DataProjectionInclusive', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifiers,
                tableProjection: ['+title']
            });
            checkTitles(['Bohemian Rhapsody', "You're my best friend"], response, 'Data projection inclusive');
        });

        await context('DataProjectionExclusive', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifiers,
                tableProjection: ['-title']
            });
            checkTitles(['undefined', 'undefined'], response, 'Data projection exclusive');
        });
    });

    /// Queries on index table
    await context('IndexTable', async () => {
        const index = 'byArtist';
        const queens = ['Bohemian Rhapsody', 'Killer Queen', "You're my best friend"];
        const thebeatles = ['Hey Jude'];
        const thewhos = ["Won't get fooled again", 'Who are you'];

        function checkTitles(expected: string[][], response: ITableSearchResponse, msg: string) {
            check(expected.length, response.items.length, `${msg}: Record count should match`);
            for (let idx = 0; idx < expected.length; idx++) {
                checkOneOf(
                    expected[idx],
                    (response.items[idx].indexFields as ISong | undefined)?.title ?? 'undefined',
                    `${msg}: Record ${idx} should match`
                );
            }
        }

        await context('PointSearch', async () => {
            const response = await service.search({ index, keys: [{ operator: 'eq', value: 'Queen' }], specifiers });
            checkTitles([queens, queens, queens], response, 'Point search');
        });

        await context('PointSearchShouldNotMatchPrefix', async () => {
            const response = await service.search({ index, keys: [{ operator: 'eq', value: 'Q' }], specifiers });
            checkTitles([], response, 'Point search should only return full matches');
        });

        await context('GTE', async () => {
            const response = await service.search({ index, keys: [{ operator: 'gte', value: 'The Beatles' }], specifiers });
            checkTitles([thebeatles, thewhos, thewhos], response, 'GTE search');
        });

        await context('Descending', async () => {
            // Descending order: Note: Titles do not have to be sorted; only artists should be sorted!
            const response = await service.search({
                index,
                keys: [{ operator: 'gte', value: 'The Beatles' }],
                specifiers,
                keysOrder: 'descending'
            });
            checkTitles([thewhos, thewhos, thebeatles], response, 'GTE search in descending order');
        });

        await context('LTE', async () => {
            const response = await service.search({ index, keys: [{ operator: 'lte', value: 'The Beatles' }], specifiers });
            checkTitles([queens, queens, queens, thebeatles], response, 'LTE search');
        });

        await context('Between1', async () => {
            const response = await service.search({
                index,
                keys: [{ operator: 'between', value: 'The Beatles', value2: 'The Beatles' }],
                specifiers
            });
            checkTitles([thebeatles], response, 'BETWEEN search one 1 value');
        });

        await context('Between2', async () => {
            const response = await service.search({
                index,
                keys: [{ operator: 'between', value: 'The Beatles', value2: 'The Who' }],
                specifiers
            });
            checkTitles([thebeatles, thewhos, thewhos], response, 'BETWEEN search on multiple values');
        });

        await context('Prefix', async () => {
            const response = await service.search({ index, keys: [{ operator: 'prefix', value: 'The' }], specifiers });
            checkTitles([thebeatles, thewhos, thewhos], response, 'PREFIX search');
        });

        await context('KeyFilter', async () => {
            const response = await service.search({ index, keys: [{ operator: 'contains', value: 'Who' }], specifiers });
            checkTitles([thewhos, thewhos], response, 'KEY FILTER search');
        });

        await context('DataFilter', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifiers
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Filter Search');
        });

        await context('IndexProjectionInclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifiers,
                indexProjection: ['+title']
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Projection Inclusive');
        });

        await context('IndexProjectionExclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifiers,
                indexProjection: ['-title']
            });
            checkTitles([['undefined']], response, 'Data Projection Exclusive');
        });

        await context('TableProjectionInclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifiers,
                indexProjection: ['+title'],
                tableProjection: ['+album']
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Projection Inclusive');
            check(
                "Who's Next",
                (response.items[0].tableFields as ISong | undefined)?.album ?? 'undefined',
                'There should be a table projection'
            );
        });

        // TODO Allow partition keys to partition data and/or indexes
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

        await context('table-persistence', async () => {
            const portal = runner.getPortal().typed<StorageTestActor>(STORAGE_TEST_ACTOR_TABLE);
            const actor = portal.retrieve([]);
            await tablepersistence_get_store(actor);
            await tablepersistence_store_search(actor, new Time(), runner.getPortal());
        });

        await context('tables', async () => {
            await table(runner.getPortal());
            await table2(runner.getPortal());
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
    return contexts.length > 0 ? contexts.join('->') : '';
}

function check<T>(expected: T, actual: T, descr: string) {
    if (expected === actual) {
        console.log(`[passed] ${c()} ${descr} (expected = actual = ${actual})`);
    } else {
        console.log(`[FAILED] ${c()} ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

function checkOneOf<T>(expected: T[], actual: T, descr: string) {
    if (expected.includes(actual)) {
        console.log(`[passed] ${c()} ${descr} (expected ${JSON.stringify(expected)} includes actual ${actual})`);
    } else {
        console.log(`[FAILED] ${c()} ${descr} (expected: one of ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
