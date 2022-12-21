import { Logger, currentScope } from '../logging';
import { sleep } from '../util';

describe('Logging', () => {
    test('Basic', async () => {
        const logger = new Logger();
        expect(currentScope()).toBe(logger.getRootScope());
        const a = logger.newChildScope('A');
        a.perform(() => {
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.getRootScope());
    });

    test('Without enter', async () => {
        const logger = new Logger();
        expect(currentScope()).toBe(logger.getRootScope());
        const a = logger.newChildScope('A');
        try {
            expect(currentScope()).toBe(logger.getRootScope());
        } finally {
            a.finish();
        }
        expect(currentScope()).toBe(logger.getRootScope());
    });

    test('Async simple', async () => {
        const logger = new Logger();
        expect(currentScope()).toBe(logger.getRootScope());
        const a = logger.newChildScope('A');
        await a.perform(async () => {
            expect(currentScope()).toBe(a);
            await sleep(500);
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.getRootScope());
    });

    test('Async complex with all proper callAsyncs', async () => {
        const logger = new Logger();
        expect(currentScope()).toBe(logger.getRootScope());
        const a = logger.newChildScope('A');
        await a.perform(async () => {
            setTimeout(() => {
                a.newChildScope('b').perform(async () => {
                    await sleep(2000);
                });
            }, 50);
            expect(currentScope()).toBe(a);
            await sleep(500);
            // Because we did put callAsync around the async sleep, we expect that
            // the in-between change to 'b' is not reflected in currentScope(). Our scope
            // after awaiting the callAsync should be the same as before the call.
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.getRootScope());

        await sleep(2500);
    });
});
