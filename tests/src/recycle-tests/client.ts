import { ConfigRunnerBuilder } from '@darlean/core';
import { sleep, Time } from '@darlean/utils';
import { RecycleActor, RECYCLE_ACTOR, IInvokeResult, RECYCLE_ACTOR_WITH_MAX_AGE } from './actor.impl';
import { ITypedPortal } from '@darlean/base';

async function test(actorPortal: ITypedPortal<RecycleActor>, portalWithMaxAge: ITypedPortal<RecycleActor>) {
    
    // Test that verifies whether actor instances are properly recycled and come to live on
    // another node.
    // The test works by sending N_CALLS batches of N_SUBSEQUENT_CALLS to an actor with id
    // i modulo N_ACTORS. Because the container is configured with a capacity of 10, it means
    // that every actor must receive the N_SUBSEQUENT_CALLS, and after some time is recycled
    // before it receives the next set of calls.
    // We check that not all calls for one specific actor (the actor with id 0) are processed
    // by the same node.
    await context('RecycleByCapacity', async () => {
        const N_CALLS = 1000;
        const N_SUBSEQUENT_CALLS = 5;
        const N_ACTORS = 100;

        const counts: Map<string, number> = new Map();
        let maxCounter = -1;

        for (let i = 0; i < N_CALLS; i++) {
            const id = i % N_ACTORS;
            const actor = actorPortal.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                if (id === 0) {
                    counts.set(result.node, (counts.get(result.node) ?? 0) + 1);
                    maxCounter = Math.max(maxCounter, result.counter);
                }
            }
        }

        check(true, counts.size > 1, 'Must have received calls from multiple actor instances');
        check(N_SUBSEQUENT_CALLS-1, maxCounter, 'Actors must be recycled after every single invocation');
    });

    await context('RecycleByTrigger', async () => {
        const N_CALLS = 10;
        const N_SUBSEQUENT_CALLS = 5;

        const counts: Map<string, number> = new Map();
        let maxCounter = -1;
        const id = 0;
            
        for (let i = 0; i < N_CALLS; i++) {
            const actor = actorPortal.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                counts.set(result.node, (counts.get(result.node) ?? 0) + 1);
                maxCounter = Math.max(maxCounter, result.counter);
            }

            await actor.triggerFinalization();
        }

        check(true, counts.size > 1, 'Must have received calls from multiple actor instances');
        check(N_SUBSEQUENT_CALLS-1, maxCounter, 'Actors must be recycled after every single invocation');
    });

    await context('RecycleByMaxAge', async () => {
        const N_CALLS = 10;
        const N_SUBSEQUENT_CALLS = 5;

        const counts: Map<string, number> = new Map();
        let maxCounter = -1;
        const id = 0;
            
        for (let i = 0; i < N_CALLS; i++) {
            const actor = portalWithMaxAge.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                counts.set(result.node, (counts.get(result.node) ?? 0) + 1);
                maxCounter = Math.max(maxCounter, result.counter);
            }
            await sleep(1000);
        }

        check(true, counts.size > 1, 'Must have received calls from multiple actor instances');
        check(N_SUBSEQUENT_CALLS-1, maxCounter, 'Actors must be recycled after every single invocation');
    });

}

async function main() {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(2500);

        await context('recycling', async () => {
            const portal = runner.getPortal().typed<RecycleActor>(RECYCLE_ACTOR);
            const portalWithMaxAge = runner.getPortal().typed<RecycleActor>(RECYCLE_ACTOR_WITH_MAX_AGE);
            await test(portal, portalWithMaxAge);
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

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
