import { suite as oracle_suite } from './oracle.impl';
import { knowledge } from './config';
import { ActorRunnerBuilder } from '@darlean/core';
import { INFO_AND_UP, Logger } from '@darlean/utils';

async function main(appId: string, servers: string[]) {
    new Logger('App', appId, [{ mask: '*', levels: INFO_AND_UP }]);

    const builder = new ActorRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge, servers));
    builder.setRemoteAccess(appId);
    builder.setDefaultHosts(servers);
    builder.hostActorLock(servers, 1);

    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = (args[1] || args[0]).split(',');

    main(appId, servers)
        .then()
        .catch((e) => console.log(e));
}
