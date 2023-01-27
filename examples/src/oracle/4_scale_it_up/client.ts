import { ConfigRunnerBuilder } from '@darlean/core';
import { deeper, FileTracer, sleep, Tracer } from '@darlean/utils';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';

async function main(reuse: boolean) {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();

    const tracer = new Tracer('app', builder.getAppId(), undefined);
    new FileTracer(tracer, builder.getAppId());

    await deeper('App', 'Client', undefined, {correlationIds: ['CLIENT']}).perform( async () => {
        await runner.start();
        try {
            await sleep(10 * 1000);
        
            const oraclePortal = runner.getPortal().typed<IOracleService>(ORACLE_SERVICE);
            const oracleService = oraclePortal.retrieve([]);
    
            await deeper('Check 1', undefined, undefined).perform( async () => {
                check(
                    20,
                    await oracleService.ask('temperature', 'What is the temperature of today?'),
                    "Today's temperature should be ok"
                );    
            });

            check(25, await oracleService.ask('temperature', 'How warm is it tomorrow?'), "Tomorrow's temperature should be ok");
    
            check(2, await oracleService.ask('price', 'What is the price of milk?'), 'The price of milk should be ok');
            if (reuse) {
                check(
                    99,
                    await oracleService.ask('price', 'What is the price of an abracadabra?'),
                    'The price of a previously learned product should be correct'
                );
            } else {
                check(
                    42,
                    await oracleService.ask('price', 'What is the price of an abracadabra?'),
                    'The price of an unknown product should be 42'
                );
            }
    
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
    });    
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
    const reuse = process.argv.includes('--reuse');
    main(reuse)
        .then()
        .catch((e) => console.log(e));
}
