import { suite as oracle_suite } from './oracle.impl';
import { knowledge } from './knowledge.cfg';
import { ActorRunnerBuilder } from '@darlean/core';
import { persistenceConfig } from './persistence.cfg';

async function main(appId: string, servers: string[]) {
    const builder = new ActorRunnerBuilder();
    builder.setRemoteAccess(appId);
    builder.setRuntimeHosts(servers);
    builder.setDefaultHosts(servers);
    builder.hostActorLock(servers, 1);
    builder.hostActorRegistry();
    builder.hostFsPersistence(persistenceConfig);
    builder.registerSuite(oracle_suite(knowledge, servers));

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
