import { IPersistenceQueryResult, IPortal, IQueryItem, TABLE_SERVICE } from '@darlean/base';
import { ConfigRunnerBuilder, TablePersistence } from '@darlean/core';
import { IIndexItem, ITableService, ITableSearchResponse } from '@darlean/tables-suite';
import { encodeNumber, ITime, parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { ITextState, StorageTestActor, STORAGE_TEST_ACTOR, STORAGE_TEST_ACTOR_TABLE, testActorSuite } from './actor.impl';

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
                    results.items.map((x) => x.value?.text).join(' '),
                    'No constraints should return all items'
                );
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

async function tablepersistence_store_search(actor: StorageTestActor, time: ITime, portal: IPortal) {
    const tasks: ParallelTask<void, void>[] = [];
    for (let idx = 0; idx < 10000; idx++) {
        tasks.push(async () => {
            const v = idx.toString().padStart(4, '0');
            await actor.store(['idxtest'], [v], v);
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
        check(
            '1200',
            ((results.items[0].tableFields?.text as string) ?? ''),
            'Prefix query must return prefix results'
        );
        check(
            '1299',
            ((results.items[99].tableFields?.text as string) ?? ''),
            'Prefix query must return prefix results'
        );
        check(
            100,
            results.items.length,
            'Prefix query must return correct amount of items'
        );
    }

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

    for (const direction of ['ascending', 'descending'] ) {
        await context(direction, async () => {
            const start = time.machineTicks();
            const items: IQueryItem<ITextState>[] = [];
            let n = 0;
            let results: IPersistenceQueryResult<ITextState> | undefined;
            while ((results === undefined) || (results?.continuationToken)) {
                results = await actor.query({ partitionKey: ['query_throughput'], sortKeyFrom: ['13000'], sortKeyTo: ['16000'], continuationToken: results?.continuationToken, sortKeyOrder: direction as 'ascending' | 'descending' });
                n++;
                for (const item of results.items) {
                    items.push(item);
                }
            }
            const stop = time.machineTicks();
            check(true, n > 1, 'Result set must have at least one continuation token');
            check(true, items.length > 1000, 'Result set must return a lot of items');
            console.log('DURATION', stop - start, 'ms');
            const idx = (direction === 'ascending') ? 0 : 1;
            for (const item of items) {
                ascdescItems[idx].push(item.sortKey[0]);
            }
        });
    }

    check(JSON.stringify(ascdescItems[0]), JSON.stringify(ascdescItems[0].sort()), 'Items should be properly sorted');
    check(JSON.stringify(ascdescItems[0]), JSON.stringify(ascdescItems[1].reverse()), 'Asc and desc should return same data, but in reverse order');
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
    check(true, !!item2.baseline, 'Put must return a baseline');

    await context('Table search', async () => {
        const items = await service.search({ specifiers: ['table'], keys: [{ operator: 'eq', value: '123' }] });
        check('World', items.items[0]?.tableFields?.Hello, 'Search on table must return proper table value');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on table must return proper id');    
    });
    
    await context('Index search', async () => {
        const items = await service.search({ index: 'a', specifiers: ['table'], keys: [] });
        check('undefined', items.items[0]?.tableFields?.hello ?? 'undefined', 'Search on index must return no table value');
        check('world', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must return proper index value');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on index must return proper id');    
        check(JSON.stringify(['45']), JSON.stringify(items.items[0]?.keys), 'Search on index must return proper key fields');    
    });

    await context('Another index search without data', async () => {
        const items = await service.search({ index: 'b', specifiers: ['table'], keys: [{ operator: 'eq', value: 'ab' }] });
        check('undefined', items.items[0]?.tableFields?.hello ?? 'undefined', 'Search on index must return no table value');
        check('undefined', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must not return values of another index');
        check('undefined', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must not return values of another index');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on index must return proper id');    
        check(JSON.stringify(['ab', 'cd']), JSON.stringify(items.items[0]?.keys), 'Search on index must return proper key fields');    
    });

    await context('Update indexed item', async () => {
        const item3 = await service.put({
            specifiers: ['table'],
            baseline: item2.baseline,
            id: ['123', '4'],
            version: '1001',
            data: { Hello: 'Moon' },
            indexes: [{ name: 'a', keys: ['45'], data: { hello: 'moon' } }]
        });
        
        // Expect index b te be removed, and index a to be changed.

        const itemGet = await service.get({
            keys: ['123', '4'],
            specifiers: ['table']
        });
        check('1001', itemGet.version, 'Version should be correct');
        check(true, !!itemGet.baseline, 'Baseline should be present');
        check(true, itemGet.baseline !== item2.baseline, 'Baseline should be different than before');
        check(true, itemGet.baseline === item3.baseline, 'Baseline for get should be same as returned from put')
        check('Moon', itemGet.data?.Hello, 'Item data must be the new value');

        const itemsSearchA = await service.search({ index: 'a', specifiers: ['table'], keys: [] });
        check(1, itemsSearchA.items.length, 'Index search should return only 1 record');
        check(JSON.stringify(['123', '4']), JSON.stringify(itemsSearchA.items[0]?.id), 'Search on index must return proper id');    
        check(JSON.stringify(['45']), JSON.stringify(itemsSearchA.items[0]?.keys), 'Search on index must return proper key fields');    

        const itemsSearchB = await service.search({ index: 'b', specifiers: ['table'], keys: [] });
        check(0, itemsSearchB.items.length, 'Index search on removed index should return no records');
    });
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
