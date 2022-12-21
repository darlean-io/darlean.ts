import { suite as oracle_suite} from './oracle.impl';
import { knowledge } from './config';
import { ActorRunnerBuilder } from '@darlean/core';
import { INFO_AND_UP, Logger, sleep } from '@darlean/utils';

async function main(appId: string, servers: string[]) {
    new Logger('App', appId, [{mask: '*', levels: INFO_AND_UP}]);
    
    const builder = new ActorRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge, servers));
    builder.setRemoteAccess(appId);
    const runner = builder.build();
    await runner.start();
    try {
        await sleep(60*1000);
    } finally {
        await runner.stop();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = (args[1] || args[0]).split(',');

    main(appId, servers).then().catch((e) => console.log(e));
}