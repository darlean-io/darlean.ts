import { parallel, ParallelAbort } from '../parallel';
import { sleep } from '../util';

describe('Parallel execution of tasks', () => {
    test('Parallel', async () => {
        const log: number[] = [];
        const tasks = [
            async () => {
                await sleep(50);
                log.push(1);
                return 1;
            },
            async () => {
                await sleep(100);
                log.push(2);
                return 2;
            },
            async () => {
                await sleep(200);
                log.push(3);
                return 3;
            },
            async () => {
                await sleep(300);
                log.push(4);
                return 4;
            },
            async () => {
                await sleep(500);
                log.push(5);
                return 5;
            }
        ];
        const results = await parallel(tasks, 1000);
        expect(log).toEqual([1, 2, 3, 4, 5]);
        expect(results.result).toBeUndefined();
        expect(results.results).toEqual([
            { done: true, result: 1 },
            { done: true, result: 2 },
            { done: true, result: 3 },
            { done: true, result: 4 },
            { done: true, result: 5 }
        ]);
    });

    test('ParallelWithTimeout', async () => {
        const log: number[] = [];
        const tasks = [
            async () => {
                await sleep(50);
                log.push(1);
                return 1;
            },
            async () => {
                await sleep(100);
                log.push(2);
                return 2;
            },
            async () => {
                await sleep(200);
                log.push(3);
                return 3;
            },
            async () => {
                await sleep(300);
                log.push(4);
                return 4;
            },
            async () => {
                await sleep(500);
                log.push(5);
                return 5;
            }
        ];
        const results = await parallel(tasks, 250);
        expect(log).toEqual([1, 2, 3]);
        expect(results.result).toBeUndefined();
        expect(results.results).toEqual([
            { done: true, result: 1 },
            { done: true, result: 2 },
            { done: true, result: 3 },
            { done: false },
            { done: false }
        ]);

        await sleep(600);

        expect(log).toEqual([1, 2, 3, 4, 5]);
        expect(results.result).toBeUndefined();
        expect(results.results).toEqual([
            { done: true, result: 1 },
            { done: true, result: 2 },
            { done: true, result: 3 },
            { done: false },
            { done: false }
        ]);
    });

    test('ParallelWithAbort', async () => {
        const log: number[] = [];
        const tasks = [
            async () => {
                await sleep(50);
                log.push(1);
                return 1;
            },
            async (abort: ParallelAbort<number>) => {
                await sleep(100);
                log.push(99);
                abort(99);
                log.push(2);
                return 2;
            },
            async () => {
                await sleep(200);
                log.push(3);
                return 3;
            },
            async (abort: ParallelAbort<number>) => {
                await sleep(300);
                log.push(98);
                abort(98);
                log.push(4);
                return 4;
            },
            async () => {
                await sleep(500);
                log.push(5);
                return 5;
            }
        ];
        const results = await parallel(tasks, 400);
        expect(log).toEqual([1, 99, 2]);
        expect(results.result).toBe(99);
        expect(results.results).toEqual([
            { done: true, result: 1 },
            { done: true, result: 2 },
            { done: false },
            { done: false },
            { done: false }
        ]);

        await sleep(600);

        expect(log).toEqual([1, 99, 2, 3, 98, 4, 5]);
        expect(results.result).toBe(99);
        expect(results.results).toEqual([
            { done: true, result: 1 },
            { done: true, result: 2 },
            { done: false },
            { done: false },
            { done: false }
        ]);
    });

    test('Parallel with empty list', async () => {
        // Must finish within 5 seconds max test duration
        await parallel([], 100 * 1000);
    });
});
