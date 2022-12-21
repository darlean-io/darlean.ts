import { SharedExclusiveLock } from '../selock';

describe('Shared-Exclusive Lock', () => {
    test('SharedExclusiveLock', async () => {
        const lock = new SharedExclusiveLock('shared');

        {
            // Test multiple shared
            await lock.beginShared('A', []);
            await lock.beginShared('B', []);
            await lock.endShared('A');
            await lock.endShared('B');
        }

        {
            // Test multiple exclusive. Should block.
            let fired = false;
            setTimeout(() => {
                fired = true;
                lock.endExclusive('A');
            }, 1000);
            await lock.beginExclusive('A', []);
            await lock.beginExclusive('B', []);
            expect(fired).toBeTruthy();
            lock.endExclusive('B');
        }

        {
            // Test multiple exclusive with proper reentrancy token.
            let fired = false;
            const t = setTimeout(() => {
                fired = true;
                lock.endExclusive('A');
            }, 1000);
            await lock.beginExclusive('A', []);
            await lock.beginExclusive('B', ['A']);
            expect(fired).toBeFalsy();
            lock.endExclusive('B');
            lock.endExclusive('A');
            clearTimeout(t);
        }

        {
            // Test reentrancy for shared within exclusive
            await lock.beginExclusive('A', []);
            await lock.beginShared('B', ['A']);
            await lock.endShared('B');
            await lock.endExclusive('A');
        }

        {
            // Test no reentrancy for shared within exclusive with other reentrancyToken
            let fired = false;
            setTimeout(() => {
                fired = true;
                lock.endExclusive('A');
            }, 1000);
            await lock.beginExclusive('A', []);

            // Blocks until timeout fires when A is released
            await lock.beginShared('B', ['C']);
            expect(fired).toBeTruthy();
            await lock.endShared('B');
        }

        {
            // Test no reentrancy for exclusive within shared lock (no upgrade from shared to exclusive)
            await lock.beginShared('A', []);

            // Should raise error
            let msg = '';
            try {
                await lock.beginExclusive('B', ['A']);
            } catch (e) {
                msg = e as string;
            }
            expect(msg).toBe('NO_UPGRADE');
            await lock.endShared('A');
        }
    });
});
