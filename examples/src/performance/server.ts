import { suite as actor_suite } from './actor.impl';
import { ActorRunnerBuilder } from '@darlean/core';

async function main(appId: string, servers: string[]) {
    const builder = new ActorRunnerBuilder();
    builder.setRemoteAccess(appId);
    builder.setDefaultApps(servers);
    builder.hostActorLock(servers, 1);
    builder.registerSuite(actor_suite());

    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = args[1].split(',');

    main(appId, servers)
        .then()
        .catch((e) => console.log(e));
}
