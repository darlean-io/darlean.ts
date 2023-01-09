import { suite as oracle_suite } from './oracle.impl';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import { knowledge } from './config';
import { ActorRunnerBuilder } from '@darlean/core';

async function main() {
    const builder = new ActorRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge));
    const runner = builder.build();

    await runner.start();
    try {
        const oracleService = runner.getPortal().retrieve<IOracleService>(ORACLE_SERVICE, []);

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
    } finally {
        await runner.stop();
    }
}

function check(expected: number, actual: number, descr: string) {
    if (expected === actual) {
        console.log(`PASSED ${descr} (expected = actual = ${actual})`);
    } else {
        console.log(`FAILED ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
