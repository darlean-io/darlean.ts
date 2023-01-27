import { IPerformanceActor, PERFORMANCE_ACTOR_STATIC } from './actor.intf';
import { FileTracer, parallel, ParallelTask, Time, Tracer } from '@darlean/utils';
import { ConfigRunnerBuilder } from '@darlean/core';

async function main(servers: string[]) {
    const tracer = new Tracer(undefined, undefined, undefined, [{ scope: 'io.darlean.remote.invoke', interval: 1000 }]);
    const toFile = new FileTracer(tracer, 'client');

    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        const time = new Time();
        const portal = runner.getPortal().typed<IPerformanceActor>(PERFORMANCE_ACTOR_STATIC);

        const tasks: ParallelTask<number, void>[] = [];
        for (let i = 0; i < 100000; i++) {
            tasks.push(async () => {
                const app = servers[i % servers.length];
                const actor = portal.retrieve([app, i.toString()]);
                const result = await actor.add(i, 5);
                return result;
            });
        }

        const start = time.machineTicks();
        const results = await parallel(tasks, 120 * 1000, 100);
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
                process.exitCode = 2;
            }

            const stop = time.machineTicks();
            const duration = stop - start;
            const perSecond = success / (duration * 0.001);
            console.log('Finished', duration, 'ms', ' / ', perSecond, '/sec');

            if (perSecond < 4000) {
                // process.exitCode = 3;
            }
        }
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
        toFile.dump();
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
