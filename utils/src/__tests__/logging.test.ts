import { Tracer, currentScope, deeper } from '../tracing';
import { sleep } from '../util';

describe('Logging', () => {
    test('Basic', async () => {
        const logger = new Tracer();
        expect(currentScope()).toBe(logger.root());
        const a = logger.newChildScope('A');
        a.perform(() => {
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.root());
    });

    test('Without enter', async () => {
        const logger = new Tracer();
        expect(currentScope()).toBe(logger.root());
        const a = logger.newChildScope('A');
        try {
            expect(currentScope()).toBe(logger.root());
        } finally {
            a.finish();
        }
        expect(currentScope()).toBe(logger.root());
    });

    test('Async simple', async () => {
        const logger = new Tracer();
        expect(currentScope()).toBe(logger.root());
        const a = logger.newChildScope('A');
        await a.perform(async () => {
            expect(currentScope()).toBe(a);
            await sleep(500);
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.root());
    });

    test('Async nested', async () => {
        const events: { parentUid?: string; uid: string; scope: string }[] = [];
        const logger = new Tracer();
        logger.on('enter', (event) => {
            events.push({
                parentUid: event.getParentUid(),
                uid: event.getUid(),
                scope: event.scope || ''
            });
        });
        expect(currentScope()).toBe(logger.root());
        const a = logger.newChildScope('A', undefined, undefined, { correlationIds: ['A'] });
        await a.perform(async () => {
            expect(currentScope()).toBe(a);
            expect(currentScope().getCorrelationIds()).toStrictEqual(['A']);
            const b = deeper('B');
            expect(b.getCorrelationIds()).toStrictEqual(['A']);
            await b.perform(async () => {
                expect(currentScope()).toBe(b);
                await sleep(20);
                expect(currentScope()).toBe(b);
                expect(currentScope().getCorrelationIds()).toStrictEqual(['A']);
            });
            expect(currentScope()).toBe(a);
            const c = deeper('C');
            await c.perform(async () => {
                expect(currentScope()).toBe(c);
                await sleep(20);
                expect(currentScope()).toBe(c);
                expect(currentScope().getCorrelationIds()).toStrictEqual(['A']);
            });
            expect(currentScope()).toBe(a);
        });
        expect(currentScope()).toBe(logger.root());
        expect(events[0]?.scope).toBe('A');
        expect(events[1]?.scope).toBe('B');
        expect(events[1]?.parentUid).toBe(events[0].uid);
        expect(events[2]?.scope).toBe('C');
        expect(events[2]?.parentUid).toBe(events[0].uid);
    });

    test('Async complex with all proper callAsyncs', async () => {
        const logger = new Tracer();
        expect(currentScope()).toBe(logger.root());
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
        expect(currentScope()).toBe(logger.root());

        await sleep(2500);
    });
});
