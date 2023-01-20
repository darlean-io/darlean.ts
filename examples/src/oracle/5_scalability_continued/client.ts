import { ConfigRunnerBuilder } from '@darlean/core';
import { parallel, ParallelTask, sleep } from '@darlean/utils';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';

async function main() {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();

    await runner.start();
    try {
        await sleep(10 * 1000);

        const oraclePortal = runner.getPortal().typed<IOracleService>(ORACLE_SERVICE);
        const oracleService = oraclePortal.retrieve([]);

        check(
            20,
            await oracleService.ask('temperature', 'What is the temperature of today?'),
            "Today's temperature should be ok"
        );
        check(25, await oracleService.ask('temperature', 'How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

        check(2, await oracleService.ask('price', 'What is the price of milk?'), 'The price of milk should be ok');

        console.log('Ensure all read actors are active. Fire 1000 questions with 100 in parallel.');
        const tasks: ParallelTask<number, void>[] = [];
        for (let i = 0; i < 1000; i++) {
            tasks.push(() => oracleService.ask('price', 'What is the price of an abracadabra?'));
        }
        await parallel(tasks, 10 * 1000, 100);

        check(
            42,
            await oracleService.ask('price', 'What is the price of an abracadabra?'),
            'The price of an unknown product should be 42'
        );

        await oracleService.teach('price', 'abracadabra', 99);

        console.log('Sleep to give the reader actor the time to fetch the newly learned fact (readers refresh every 10 seconds)');
        await sleep(15 * 1000);

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
