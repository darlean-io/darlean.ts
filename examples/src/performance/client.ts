import { ActorRunnerBuilder, NatsServer } from '@darlean/core';
import { IPerformanceActor, PERFORMANCE_ACTOR } from './actor.intf';
import { parallel, ParallelTask, Time } from '@darlean/utils';

async function main(appId: string, servers: string[]) {
    const builder = new ActorRunnerBuilder();
    builder.setRemoteAccess(appId);
    builder.setDefaultApps(servers);

    builder.registerActor({
        type: PERFORMANCE_ACTOR,
        kind: 'multiplar',
        apps: servers,
        placement: {
            version: '20230112',
            bindIdx: 0
        }
    });
    const runner = builder.build();

    const natsServer = new NatsServer();

    natsServer.start();

    await runner.start();

    try {
        const time = new Time();
        const portal = runner.getPortal().typed<IPerformanceActor>(PERFORMANCE_ACTOR);

        const tasks: ParallelTask<number, void>[] = [];
        for (let i = 0; i < 100000; i++) {
            tasks.push(async () => {
                const app = `server0${i % servers.length}`;
                const actor = portal.retrieve([app, i.toString()]);
                const result = await actor.add(i, 5);
                return result;
            });
        }

        const start = time.machineTicks();
        await parallel(tasks, 60 * 1000, 1000);
        const stop = time.machineTicks();
        const duration = stop - start;
        const perSecond = tasks.length / (duration * 0.001);
        console.log('Finished', duration, 'ms', ' / ', perSecond, '/sec');
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
        natsServer.stop();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = args[1].split(',');

    main(appId, servers)
        .then()
        .catch((e) => console.log(e));
}
