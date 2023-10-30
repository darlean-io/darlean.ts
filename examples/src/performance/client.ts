import { IPerformanceActor, PERFORMANCE_ACTOR_STATIC } from './actor.intf';
import { parallel, ParallelTask, sleep, Time } from '@darlean/utils';
import { ConfigRunnerBuilder } from '@darlean/core';

async function main(servers: string[]) {
    Error.stackTraceLimit = -1;
    //const tracer = new Tracer(undefined, undefined, undefined, [{ scope: 'io.darlean.remote.invoke', interval: 1000 }]);
    //const toFile = new FileTracer(tracer, 'client');

    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        await sleep(10000);

        const time = new Time();
        const portal = runner.getPortal().typed<IPerformanceActor>(PERFORMANCE_ACTOR_STATIC);

        let latency = 0;

        const tasks: ParallelTask<number, void>[] = [];
        const N = 100000;
        for (let i = 0; i < N; i++) {
            tasks.push(async () => {
                try {
                    const strt = time.machineTicks();
                    const app = servers[i % servers.length];
                    const actor = portal.retrieve([app, 'A']);
                    const result = await actor.addPure(i);
                    const stp = time.machineTicks();
                    latency += stp - strt;
                    return result;
                } catch (e) {
                    console.log(e);
                    throw e;
                }
            });
        }

        const start = time.machineTicks();
        const results = await parallel(tasks, 120 * 1000, 400);
        const stop = time.machineTicks();
        latency /= results.results.length || 1;
        if (results.status === 'completed') {
            let success = 0;
            let error = 0;
            results.results.forEach((result) => {
                if (result.done && !result.error) {
                    success++;
                }
                if (result.error) {
                    error++;
                }
            });

            console.log('Errors', error);
            if (error > 0) {
                let idx = 0;
                for (const result of results.results) {
                    if (result.error) {
                        console.log('ERROR', idx, result.error, JSON.stringify(result.error));
                    }
                    idx++;
                }
                process.exitCode = 2;
            }

            const duration = stop - start;
            const perSecond = success / (duration * 0.001);
            console.log('Finished', duration, 'ms', ' / ', perSecond, '/sec');
            console.log('Latency', latency, 'ms');

            if (perSecond < 4000) {
                // process.exitCode = 3;
            }
        }
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
        //toFile.dump();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);

    const idx = args.indexOf('--servers');
    const servers = idx >= 0 ? args[idx + 1]?.split(',') : ['server'];

    main(servers)
        .then()
        .catch((e) => console.log(e));
}
