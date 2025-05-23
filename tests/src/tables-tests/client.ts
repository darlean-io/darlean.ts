import { ITableIndexItem, IPortal, ITableSearchItem, ITableSearchResponse, ITablesService, TABLES_SERVICE } from '@darlean/base';
import { ConfigRunnerBuilder, TablePersistence } from '@darlean/core';
import { encodeNumber, ITime, MultiDeSer, parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { STORAGE_TEST_ACTOR_TABLE, TableStorageTestActor, testActorSuite } from './actor.impl';

async function tablepersistence_get_store(actor: TableStorageTestActor) {
    check(undefined, await actor.get(['foo'], []), 'TABLE: Non existing partition key');
    check(undefined, await actor.get([], ['foo']), 'TABLE: Non existing sort key');

    await actor.store(['foo'], [], 'FOO');
    check('FOO', await actor.get(['foo'], []), 'TABLE: Existing sort key');
    check('FOO', await actor.get([], ['foo']), 'TABLE: For table persistence, there is no difference between sort and partition key');

    await actor.store(['foo'], [], undefined);
    check(undefined, await actor.get(['foo'], []), 'TABLE: Removed partition key');
}

async function tablepersistence_store_search(actor: TableStorageTestActor, time: ITime, portal: IPortal) {
    const tasks: ParallelTask<void, void>[] = [];
    for (let idx = 0; idx < 10000; idx++) {
        tasks.push(async () => {
            const v = idx.toString().padStart(4, '0');
            await actor.store([], [v], v);
        });
    }
    const start = time.machineTicks();
    const results = await parallel(tasks, 100000, -1000);
    const stop = time.machineTicks();
    console.log('DURATION', stop - start, ' | ', (1000 * results.results.length) / (stop - start), 'stores/sec');
    const deser = new MultiDeSer();
    const ts = portal.retrieve<ITablesService>(TABLES_SERVICE, ['testtable']);
    const tp = new TablePersistence<string>(ts, () => [], deser, 'indexstoragetest');

    await context('Single chunk table search', async () => {
        const results = await tp.search({
            keys: [{ operator: 'prefix', value: '12' }]
        });
        check('1200', (results.items[0].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check('1299', (results.items[99].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check(100, results.items.length, 'Prefix query must return correct amount of items');
    });

    check('completed', results.status, 'Parallel execution should be completed');

    await context('Multi-chunk table search', async () => {
        const items: ITableSearchItem[] = [];
        let n = 0;
        let results: ITableSearchResponse | undefined;
        while (true) {
            results = await tp.search({
                keys: [{ operator: 'prefix', value: '12' }],
                maxChunkItems: 10,
                continuationToken: results?.continuationToken
            });
            n++;
            for (const item of results.items) {
                items.push(item);
            }
            if (!results.continuationToken) {
                break;
            }
        }
        check(11, n, 'Amount of chunks should be correct');
        check('1200', (items[0].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check('1299', (items[99].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check(100, items.length, 'Prefix query must return correct amount of items');
    });

    await context('Multi-chunk table search with chunk-iterator', async () => {
        const items: ITableSearchItem[] = [];
        let n = 0;
        let results: ITableSearchResponse | undefined;
        for await (const chunk of tp.searchChunks({
            keys: [{ operator: 'prefix', value: '12' }],
            maxChunkItems: 10,
            continuationToken: results?.continuationToken
        })) {
            n++;
            for (const item of chunk.items) {
                items.push(item);
            }
        }
        check(11, n, 'Amount of chunks should be correct');
        check('1200', (items[0].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check('1299', (items[99].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check(100, items.length, 'Prefix query must return correct amount of items');
    });

    await context('Multi-chunk table search with item-iterator', async () => {
        const items: ITableSearchItem[] = [];
        let results: ITableSearchResponse | undefined;
        for await (const item of tp.searchItems({
            keys: [{ operator: 'prefix', value: '12' }],
            maxChunkItems: 10,
            continuationToken: results?.continuationToken
        })) {
            items.push(item);
        }
        check('1200', (items[0].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check('1299', (items[99].tableFields?.text as string) ?? '', 'Prefix query must return prefix results');
        check(100, items.length, 'Prefix query must return correct amount of items');
    });

    await context('Index search', async () => {
        const results = await tp.search({
            index: 'byprefix',
            keys: [
                { operator: 'eq', value: '12' },
                { operator: 'eq', value: '23' }
            ]
        });
        check(10, results.items.length, 'Index query must return correct amount of items');
        check('VAL1230', (results.items[0].indexFields?.value as string) ?? '', 'Index query must return prefix results');
        check('VAL1239', (results.items[9].indexFields?.value as string) ?? '', 'Index query must return prefix results');
    });
}

async function table(portal: IPortal) {
    const service = portal.retrieve<ITablesService>(TABLES_SERVICE, ['MyTable']);
    const item = await service.get({
        keys: ['123', '4'],
        specifier: 'table'
    });
    const item2 = await service.put({
        specifier: 'table',
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
        const items = await service.search({ specifier: 'table', keys: [{ operator: 'eq', value: '123' }] });
        check('World', items.items[0]?.tableFields?.Hello, 'Search on table must return proper table value');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on table must return proper id');
    });

    await context('Index search', async () => {
        const items = await service.search({ index: 'a', specifier: 'table', keys: [] });
        check('undefined', items.items[0]?.tableFields?.hello ?? 'undefined', 'Search on index must return no table value');
        check('world', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must return proper index value');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on index must return proper id');
        check(JSON.stringify(['45']), JSON.stringify(items.items[0]?.keys), 'Search on index must return proper key fields');
    });

    await context('Another index search without data', async () => {
        const items = await service.search({ index: 'b', specifier: 'table', keys: [{ operator: 'eq', value: 'ab' }] });
        check('undefined', items.items[0]?.tableFields?.hello ?? 'undefined', 'Search on index must return no table value');
        check('undefined', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must not return values of another index');
        check('undefined', items.items[0]?.indexFields?.hello ?? 'undefined', 'Search on index must not return values of another index');
        check(JSON.stringify(['123', '4']), JSON.stringify(items.items[0]?.id), 'Search on index must return proper id');
        check(JSON.stringify(['ab', 'cd']), JSON.stringify(items.items[0]?.keys), 'Search on index must return proper key fields');
    });

    await context('Update indexed item', async () => {
        const item3 = await service.put({
            specifier: 'table',
            baseline: item2.baseline,
            id: ['123', '4'],
            version: '1001',
            data: { Hello: 'Moon' },
            indexes: [{ name: 'a', keys: ['45'], data: { hello: 'moon' } }]
        });

        // Expect index b te be removed, and index a to be changed.

        const itemGet = await service.get({
            keys: ['123', '4'],
            specifier: 'table'
        });
        check('1001', itemGet.version, 'Version should be correct');
        check(true, !!itemGet.baseline, 'Baseline should be present');
        check(true, itemGet.baseline !== item2.baseline, 'Baseline should be different than before');
        check(true, itemGet.baseline === item3.baseline, 'Baseline for get should be same as returned from put');
        check('Moon', itemGet.data?.Hello, 'Item data must be the new value');

        const itemsSearchA = await service.search({ index: 'a', specifier: 'table', keys: [] });
        check(1, itemsSearchA.items.length, 'Index search should return only 1 record');
        check(JSON.stringify(['123', '4']), JSON.stringify(itemsSearchA.items[0]?.id), 'Search on index must return proper id');
        check(JSON.stringify(['45']), JSON.stringify(itemsSearchA.items[0]?.keys), 'Search on index must return proper key fields');

        const itemsSearchB = await service.search({ index: 'b', specifier: 'table', keys: [] });
        check(0, itemsSearchB.items.length, 'Index search on removed index should return no records');
    });
}

async function table2(portal: IPortal) {
    interface ISong {
        title: string;
        artist: string;
        album: string;
    }

    function indexer(data: ISong): ITableIndexItem[] {
        return [
            { name: 'byArtist', keys: [data.artist], data: { title: data.title } },
            { name: 'byAlbum', keys: [data.album], data: { title: data.title } }
        ];
    }

    const service = portal.retrieve<ITablesService>(TABLES_SERVICE, ['SongsTable']);
    const specifier = 'table.songs';
    let version = 0;

    async function put(song: ISong, baseline: string | undefined) {
        await service.put({
            specifier,
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
            const bohemian = await service.get({ keys: ['Bohemian Rhapsody'], specifier });
            check('Bohemian Rhapsody', (bohemian.data as ISong | undefined)?.title, 'Fields should be ok');
            check('Queen', (bohemian.data as ISong | undefined)?.artist, 'Fields should be ok');
        });

        await context('PointSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'eq', value: 'Killer Queen' }], specifier });
            checkTitles(['Killer Queen'], response, 'Point search should return all fields');
            check('Sheer Heart Attack', (response.items[0].tableFields as ISong | undefined)?.album, 'Point search should fill in all fields');
        });

        await context('PointSearchNotPrefix', async () => {
            const response = await service.search({ keys: [{ operator: 'eq', value: 'Killer' }], specifier });
            checkTitles([], response, 'Point search should only return full matches');
        });

        await context('GTESearch', async () => {
            const response = await service.search({ keys: [{ operator: 'gte', value: 'Killer Queen' }], specifier });
            checkTitles(['Killer Queen', 'Who are you', "Won't get fooled again", "You're my best friend"], response, 'GTE Search');
        });

        await context('GTESearchDescending', async () => {
            const response = await service.search({
                keys: [{ operator: 'gte', value: 'Killer Queen' }],
                keysOrder: 'descending',
                specifier
            });
            checkTitles(["You're my best friend", "Won't get fooled again", 'Who are you', 'Killer Queen'], response, 'GTE Search Descending');
        });

        await context('LTESearch', async () => {
            const response = await service.search({ keys: [{ operator: 'lte', value: 'Killer Queen' }], specifier });
            checkTitles(['Bohemian Rhapsody', 'Hey Jude', 'Killer Queen'], response, 'LTE Search');
        });

        await context('BetweenSearch', async () => {
            const response = await service.search({
                keys: [{ operator: 'between', value: 'Killer Queen', value2: "Won't get fooled again" }],
                specifier
            });
            checkTitles(['Killer Queen', 'Who are you', "Won't get fooled again"], response, 'Between Search');
        });

        await context('PrefixSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'prefix', value: 'W' }], specifier });
            checkTitles(['Who are you', "Won't get fooled again"], response, 'Prefix Search');
        });

        await context('KeyFilterSearch', async () => {
            const response = await service.search({ keys: [{ operator: 'contains', value: 'fooled' }], specifier });
            checkTitles(["Won't get fooled again"], response, 'Key Filter Search');
        });

        await context('DataFilterSearch', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifier
            });
            checkTitles(['Bohemian Rhapsody', "You're my best friend"], response, 'Key Filter Search');
        });

        await context('DataProjectionInclusive', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifier,
                tableProjection: ['+title']
            });
            checkTitles(['Bohemian Rhapsody', "You're my best friend"], response, 'Data projection inclusive');
        });

        await context('DataProjectionExclusive', async () => {
            const response = await service.search({
                filter: { expression: ['contains', ['field', 'album'], ['literal', 'Opera']] },
                specifier,
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
            const response = await service.search({ index, keys: [{ operator: 'eq', value: 'Queen' }], specifier });
            checkTitles([queens, queens, queens], response, 'Point search');
        });

        await context('PointSearchShouldNotMatchPrefix', async () => {
            const response = await service.search({ index, keys: [{ operator: 'eq', value: 'Q' }], specifier });
            checkTitles([], response, 'Point search should only return full matches');
        });

        await context('GTE', async () => {
            const response = await service.search({ index, keys: [{ operator: 'gte', value: 'The Beatles' }], specifier });
            checkTitles([thebeatles, thewhos, thewhos], response, 'GTE search');
        });

        await context('Descending', async () => {
            // Descending order: Note: Titles do not have to be sorted; only artists should be sorted!
            const response = await service.search({
                index,
                keys: [{ operator: 'gte', value: 'The Beatles' }],
                specifier,
                keysOrder: 'descending'
            });
            checkTitles([thewhos, thewhos, thebeatles], response, 'GTE search in descending order');
        });

        await context('LTE', async () => {
            const response = await service.search({ index, keys: [{ operator: 'lte', value: 'The Beatles' }], specifier });
            checkTitles([queens, queens, queens, thebeatles], response, 'LTE search');
        });

        await context('Between1', async () => {
            const response = await service.search({
                index,
                keys: [{ operator: 'between', value: 'The Beatles', value2: 'The Beatles' }],
                specifier
            });
            checkTitles([thebeatles], response, 'BETWEEN search one 1 value');
        });

        await context('Between2', async () => {
            const response = await service.search({
                index,
                keys: [{ operator: 'between', value: 'The Beatles', value2: 'The Who' }],
                specifier
            });
            checkTitles([thebeatles, thewhos, thewhos], response, 'BETWEEN search on multiple values');
        });

        await context('Prefix', async () => {
            const response = await service.search({ index, keys: [{ operator: 'prefix', value: 'The' }], specifier });
            checkTitles([thebeatles, thewhos, thewhos], response, 'PREFIX search');
        });

        await context('KeyFilter', async () => {
            const response = await service.search({ index, keys: [{ operator: 'contains', value: 'Who' }], specifier });
            checkTitles([thewhos, thewhos], response, 'KEY FILTER search');
        });

        await context('DataFilter', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifier
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Filter Search');
        });

        await context('IndexProjectionInclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifier,
                indexProjection: ['+title']
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Projection Inclusive');
        });

        await context('IndexProjectionExclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifier,
                indexProjection: ['-title']
            });
            checkTitles([['undefined']], response, 'Data Projection Exclusive');
        });

        await context('TableProjectionInclusive', async () => {
            const response = await service.search({
                index,
                filter: { expression: ['contains', ['field', 'title'], ['literal', 'again']] },
                specifier,
                indexProjection: ['+title'],
                tableProjection: ['+album']
            });
            checkTitles([["Won't get fooled again"]], response, 'Data Projection Inclusive');
            check("Who's Next", (response.items[0].tableFields as ISong | undefined)?.album ?? 'undefined', 'There should be a table projection');
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

        await context('table-persistence', async () => {
            const portal = runner.getPortal().typed<TableStorageTestActor>(STORAGE_TEST_ACTOR_TABLE);
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
