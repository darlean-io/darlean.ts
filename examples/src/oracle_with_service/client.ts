import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import { ActorRunnerBuilder, NatsServer } from '@darlean/core';
import { test } from './tester';

async function main(appId: string, servers: string[], reuse = false) {
    const builder = new ActorRunnerBuilder();
    builder.setRemoteAccess(appId);
    builder.setRuntimeHosts(servers);
    builder.setDefaultHosts(servers);

    const runner = builder.build();

    const natsServer = new NatsServer();

    natsServer.start();

    await runner.start();

    try {
        const oracleService = runner.getPortal().retrieve<IOracleService>(ORACLE_SERVICE, []);
        await test(oracleService, reuse);
    } catch (e) {
        console.log('ERROR123', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
        natsServer.stop();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = (args[1] || args[0]).split(',');
    const reuse = args.includes('reuse');

    main(appId, servers, reuse)
        .then()
        .catch((e) => console.log(e));
}
