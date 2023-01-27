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
});
