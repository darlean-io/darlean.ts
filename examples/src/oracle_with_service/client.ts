import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import { ActorRunnerBuilder, NatsServer } from '@darlean/core';
import { sleep } from '@darlean/utils';

async function main(appId: string, servers: string[]) {
    const builder = new ActorRunnerBuilder();
    builder.setRemoteAccess(appId);
    builder.registerActor({
        type: ORACLE_SERVICE,
        hosts: servers
    });
    const runner = builder.build();

    const natsServer = new NatsServer();

    natsServer.start();
    await runner.start();
    // await sleep(5000);
    try {
        const oracleService = runner.getPortal().retrieve<IOracleService>(ORACLE_SERVICE, []);

        console.log('Starting logic');

        check(
            20,
            await oracleService.ask('temperature', 'What is the temperature of today?'),
            "Today's temperature should be ok"
        );
        check(25, await oracleService.ask('temperature', 'How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

        check(2, await oracleService.ask('price', 'What is the price of milk?'), 'The price of milk should be ok');
        check(
            42,
            await oracleService.ask('price', 'What is the price of an abracadabra?'),
            'The price of an unknown product should be 42'
        );

        await oracleService.teach('price', 'abracadabra', 99);
        check(
            99,
            await oracleService.ask('price', 'What is the price of an abracadabra?'),
            'A newly learned fact should be used by the oracle'
        );
        check(
            42,
            await oracleService.ask('temperature', 'What is the price of an abracadabra?'),
            'Another oracle instance should not know about the facts of another oracle'
        );
    } catch (e) {
        console.log('ERROR', e);
        console.log(JSON.stringify(e, undefined, 2));
    } finally {
        await runner.stop();
        await sleep(2000);
        natsServer.stop();
    }
}

function check(expected: number, actual: number, descr: string) {
    if (expected === actual) {
        console.log(`-> PASSED ${descr} (expected = actual = ${actual})`);
    } else {
        console.log(`-> FAILED ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const appId = args[0];
    const servers = (args[1] || args[0]).split(',');

    main(appId, servers)
        .then()
        .catch((e) => console.log(e));
}
