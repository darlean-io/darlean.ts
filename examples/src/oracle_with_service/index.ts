import { suite as oracle_suite } from './oracle.impl';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import { knowledge } from './knowledge.cfg';
import { ActorRunnerBuilder, DEFAULT_LOCAL_APP_ID } from '@darlean/core';
import { test } from './tester';
import { persistenceConfig } from './persistence.cfg';

async function main() {
    const builder = new ActorRunnerBuilder();
    builder.setDefaultHosts([DEFAULT_LOCAL_APP_ID]);
    builder.hostActorLock([DEFAULT_LOCAL_APP_ID], 1);
    builder.hostFsPersistence(persistenceConfig);
    builder.registerSuite(oracle_suite(knowledge));
    const runner = builder.build();

    await runner.start();
    try {
        const oracleService = runner.getPortal().retrieve<IOracleService>(ORACLE_SERVICE, []);
        await test(oracleService);
    } finally {
        await runner.stop();
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
