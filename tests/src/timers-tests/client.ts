import { ConfigRunnerBuilder } from '@darlean/core';
import { sleep, Time } from '@darlean/utils';
import { TimerTestActor, timerTestActorSuite, TIMER_TEST_ACTOR } from './actor.impl';

const INTERVAL = 500;

async function timers(actor: TimerTestActor) {
    // A "dummy" call to allow the persistence service to get up, so that the timing of the
    // subsequent "real" tests becomes more reliable.
    await context('WarmingUp', async () => {
        await actor.schedule({
            id: 'Timer00',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [{ interval: INTERVAL, success: 'continue', error: 'continue' }]
        });
        await sleep(5 * INTERVAL);
        const moments = await actor.getMoments();
        check(2, moments.length, 'There should be one event');
    });

    await context('CallOnce', async () => {
        await actor.schedule({
            id: 'Timer01',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [{ interval: INTERVAL, success: 'continue', error: 'continue' }]
        });
        await sleep(5 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([INTERVAL], moments, 'Intervals should match');
    });

    await context('Repeatcount', async () => {
        await actor.schedule({
            id: 'Timer02',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [{ interval: INTERVAL, repeatCount: 2, success: 'continue', error: 'continue' }]
        });
        await sleep(5 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([1 * INTERVAL, 1 * INTERVAL], moments, 'Intervals should match');
    });

    await context('MultipleTriggers', async () => {
        await actor.schedule({
            id: 'Timer03',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [
                { interval: INTERVAL, success: 'continue', error: 'continue' },
                { interval: 2 * INTERVAL, success: 'continue', error: 'continue' },
                { interval: INTERVAL, success: 'continue', error: 'continue' }
            ]
        });
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([1 * INTERVAL, 2 * INTERVAL, 1 * INTERVAL], moments, 'Intervals should match');
    });

    await context('MultipleTriggersAndRepeats', async () => {
        await actor.schedule({
            id: 'Timer04',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [
                { interval: INTERVAL, repeatCount: 2, success: 'continue', error: 'continue' },
                { interval: 2 * INTERVAL, repeatCount: 2, success: 'continue', error: 'continue' },
                { interval: INTERVAL, repeatCount: 1, success: 'continue', error: 'continue' }
            ]
        });
        await sleep(10 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([1 * INTERVAL, 1 * INTERVAL, 2 * INTERVAL, 2 * INTERVAL, 1 * INTERVAL], moments, 'Intervals should match');
    });

    await context('BreakOnSuccess', async () => {
        await actor.schedule({
            id: 'Timer05',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [
                { interval: INTERVAL, success: 'continue', error: 'continue' },
                { interval: 2 * INTERVAL, success: 'break', error: 'continue' },
                { interval: INTERVAL, success: 'continue', error: 'continue' }
            ]
        });
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([1 * INTERVAL, 2 * INTERVAL], moments, 'Intervals should match');
    });

    await context('BreakOnError', async () => {
        await actor.schedule(
            {
                id: 'Timer06',
                callbackActorType: '',
                callbackActorId: [],
                callbackActionName: '',
                triggers: [
                    { interval: INTERVAL, success: 'continue', error: 'continue' },
                    { interval: 2 * INTERVAL, success: 'continue', error: 'break' },
                    { interval: INTERVAL, success: 'continue', error: 'continue' }
                ]
            },
            [1, 2]
        );
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([1 * INTERVAL, 2 * INTERVAL], moments, 'Intervals should match');
    });

    await context('Indefinately', async () => {
        await actor.schedule({
            id: 'Timer07',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [{ interval: INTERVAL, repeatCount: 0, success: 'continue', error: 'continue' }]
        });
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkBetween(5, 10, moments.length - 1, 'There should be a lot of triggers');
        const expecteds = moments.slice(1).map(() => INTERVAL);
        checkIntervals(expecteds, moments, 'Intervals should match');
        await actor.cancel('Timer07');
    });

    await context('IndefinatelyUntilError', async () => {
        await actor.schedule(
            {
                id: 'Timer08',
                callbackActorType: '',
                callbackActorId: [],
                callbackActionName: '',
                triggers: [{ interval: INTERVAL, repeatCount: 0, success: 'continue', error: 'break' }]
            },
            [2]
        );
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkIntervals([INTERVAL, INTERVAL, INTERVAL], moments, 'Intervals should match');
        await actor.cancel('Timer08');
    });

    await context('Jitter', async () => {
        await actor.schedule({
            id: 'Timer09',
            callbackActorType: '',
            callbackActorId: [],
            callbackActionName: '',
            triggers: [{ interval: INTERVAL, repeatCount: 0, success: 'continue', error: 'continue', jitter: 4 * INTERVAL }]
        });
        await sleep(8 * INTERVAL);
        const moments = await actor.getMoments();
        checkBetween(1, 5, moments.length - 1, 'There should be a few triggers');
        await actor.cancel('Timer09');
    });
}

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(timerTestActorSuite());
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(2500);

        await context('timers', async () => {
            const portal = runner.getPortal().typed<TimerTestActor>(TIMER_TEST_ACTOR);
            const actor = portal.retrieve([]);
            await timers(actor);
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

function checkBetween<T>(expectedMin: T, expectedMax: T, actual: T, descr: string) {
    if (actual >= expectedMin && actual <= expectedMax) {
        let value = actual === undefined ? 'undefined' : (actual as string).toString();
        if (value.length > 100) {
            value = value.substring(0, 100) + '...';
        }

        console.log(`[passed] ${c()} ${descr} (expected: ${expectedMin}-${expectedMax}, actual: ${value})`);
    } else {
        console.log(`[FAILED] ${c()} ${descr} (expected: ${expectedMin}-${expectedMax}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

function checkMoments(expectedValues: number[], moments: number[], descr: string) {
    const times = moments.map((x) => x - moments[0]);
    if (expectedValues.length !== moments.length - 1) {
        check(expectedValues.length, moments.length - 1, `${descr}: Length should be ok`);
    }
    for (let idx = 0; idx < expectedValues.length; idx++) {
        checkBetween(expectedValues[idx], expectedValues[idx] + 150, times[idx + 1], `${descr} (${idx})`);
    }
}

function checkIntervals(expectedValues: number[], moments: number[], descr: string) {
    if (expectedValues.length !== moments.length - 1) {
        check(expectedValues.length, moments.length - 1, `${descr}: Length should be ok`);
    }
    let moment = moments[0];
    for (let idx = 0; idx < expectedValues.length; idx++) {
        const newMoment = moments[idx + 1];
        const interval = newMoment - moment;
        checkBetween(expectedValues[idx], expectedValues[idx] + 0.9 * INTERVAL, interval, `${descr} (${idx})`);
        moment = newMoment;
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
