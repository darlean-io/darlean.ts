import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import { ConfigRunnerBuilder } from '@darlean/core';
import { test } from './tester';
import { config } from './persistence.cfg';

async function main(reuse = false) {
    const builder = new ConfigRunnerBuilder(config());
    const runner = builder.build();

    await runner.start();

    try {
        const oracleService = runner.getPortal().retrieve<IOracleService>(ORACLE_SERVICE, []);
        await test(oracleService, reuse);
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
        process.exitCode = 1;
    } finally {
        await runner.stop();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const reuse = args.includes('--reuse');

    main(reuse)
        .then()
        .catch((e) => console.log(e));
}
