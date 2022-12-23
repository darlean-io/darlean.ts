import { ActorRunnerBuilder } from '@darlean/core';
import { suite as oracle_suite } from './oracle.impl';
import { IOracleActor, ORACLE_ACTOR } from './oracle.intf';
import { knowledge } from './config';

async function main() {
    const builder = new ActorRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge));
    const runner = builder.build();

    await runner.start();
    try {
        const oraclePortal = runner.getPortal().sub<IOracleActor>(ORACLE_ACTOR);

        const temperatureOracle = oraclePortal.retrieve(['temperature']);
        check(20, await temperatureOracle.ask('What is the temperature of today?'), "Today's temperature should be ok");
        check(25, await temperatureOracle.ask('How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

        const priceOracle = oraclePortal.retrieve(['price']);
        check(2, await priceOracle.ask('What is the price of milk?'), 'The price of milk should be ok');
        check(42, await priceOracle.ask('What is the price of an abracadabra?'), 'The price of an unknown product should be 42');

        await priceOracle.teach('abracadabra', 99);
        check(
            99,
            await priceOracle.ask('What is the price of an abracadabra?'),
            'A newly learned fact should be used by the oracle'
        );
        check(
            42,
            await temperatureOracle.ask('What is the price of an abracadabra?'),
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
        console.log(`FAILED ${descr} (expected: ${expected}, actual: ${actual}`);
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
