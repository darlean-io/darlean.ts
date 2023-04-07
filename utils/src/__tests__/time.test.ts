import { Time } from '../timeimpl';
import { sleep } from '../util';

describe('Time repeat', () => {
    test('Pause from within timer', async () => {
        // Tests that when you pause a test from within the timer handler, the timer does
        // perform the pause instead of continuing immediately (which was a bug).
        const time = new Time();
        let n = 0;
        const timer = time.repeat(
            async () => {
                if (n === 0) {
                    timer.pause(2000);
                }
                n++;
            },
            'Test timer',
            10
        );
        await sleep(1000);
        expect(n).toBe(1);
        await sleep(2000);
        expect(n).toBeGreaterThan(10);
        await timer.cancel();
    });

    test('Resume time used only once', async () => {
        // Tests that when you resume a test with a specified delay, that delay is used only once. Next times, the regular interval
        // must be used (this was a bug).
        const time = new Time();
        let last = time.machineTicks();
        const intervals: number[] = [];
        let n = 0;
        const timer = time.repeat(
            async () => {
                const now = time.machineTicks();
                intervals.push(now - last);
                last = now;
                if (n === 2) {
                    timer.resume(0);
                }
                n++;
            },
            'Test timer',
            200,
            0,
            5
        );
        await sleep(2000);
        console.log('MOMENTS', intervals);
        expect(n).toBe(6);
        expect(intervals[1]).toBeGreaterThan(100);
        expect(intervals[2]).toBeGreaterThan(100);
        expect(intervals[3]).toBeLessThan(100);
        expect(intervals[4]).toBeGreaterThan(100);
        expect(intervals[5]).toBeGreaterThan(100);
    });
});
