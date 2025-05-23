import { ConfigRunnerBuilder } from '@darlean/core';
import { sleep, Time } from '@darlean/utils';
import { RecycleActor, RECYCLE_ACTOR, RECYCLE_ACTOR_WITH_MAX_AGE } from './actor.impl';
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

        const countsByNode: Map<string, number> = new Map();
        let maxCounter = -1;

        for (let i = 0; i < N_CALLS; i++) {
            const id = i % N_ACTORS;
            const actor = actorPortal.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                if (id === 0) {
                    countsByNode.set(result.node, (countsByNode.get(result.node) ?? 0) + 1);
                    maxCounter = Math.max(maxCounter, result.counter);
                }
            }
        }

        check(true, countsByNode.size > 1, 'Must have received calls from multiple actor instances');
        check(N_SUBSEQUENT_CALLS - 1, maxCounter, 'Actors must be recycled after every single invocation');
    });

    await context('RecycleByTrigger', async () => {
        const N_CALLS = 10;
        const N_SUBSEQUENT_CALLS = 5;

        const countsByNode: Map<string, number> = new Map();
        let maxCounter = -1;
        const id = 0;

        for (let i = 0; i < N_CALLS; i++) {
            const actor = actorPortal.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                countsByNode.set(result.node, (countsByNode.get(result.node) ?? 0) + 1);
                maxCounter = Math.max(maxCounter, result.counter);
            }

            await actor.triggerFinalization();
        }

        check(true, countsByNode.size > 1, 'Must have received calls from multiple actor instances');
        check(N_SUBSEQUENT_CALLS - 1, maxCounter, 'Actors must be recycled after every single invocation');
    });

    await context('RecycleByMaxAge', async () => {
        const N_CALLS = 10;
        const N_SUBSEQUENT_CALLS = 5;

        const countsByNode: Map<string, number> = new Map();
        const countsByInstance: Map<string, number> = new Map();
        let maxCounter = -1;
        const id = 0;

        // When an actor is recycled, the framework *attempts* to use a different node, but it is not
        // guaranteed. The framework randomly choses a node, so it can also be the same node. Therefore,
        // we have quite a long sleep (3sec) combined with N_CALLS = 10 will last 30 seconds in total,
        // which means 5-6 times a new instance. Chances are high that we will at least have more than
        // one node.
        for (let i = 0; i < N_CALLS; i++) {
            const actor = portalWithMaxAge.retrieve([id.toString()]);

            for (let j = 0; j < N_SUBSEQUENT_CALLS; j++) {
                const result = await actor.invoke();
                countsByNode.set(result.node, (countsByNode.get(result.node) ?? 0) + 1);
                countsByInstance.set(result.instance, (countsByInstance.get(result.instance) ?? 0) + 1);
                
                maxCounter = Math.max(maxCounter, result.counter);
            }
            await sleep(3000);
        }
        
        check(true, countsByInstance.size > 1, 'Must have received calls from multiple actor instances');
        check(true, countsByNode.size > 1, 'Must have received calls from multiple actor nodes');
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
