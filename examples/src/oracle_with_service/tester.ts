import { IOracleService } from './oracle.intf';

export async function test(oracleService: IOracleService, reuse = false) {
    check(20, await oracleService.ask('temperature', 'What is the temperature of today?'), "Today's temperature should be ok");
    check(25, await oracleService.ask('temperature', 'How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

    check(2, await oracleService.ask('price', 'What is the price of milk?'), 'The price of milk should be ok');
    if (reuse) {
        check(
            99,
            await oracleService.ask('price', 'What is the price of an abracadabra?'),
            'The price of an previously learned product should be ok'
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
}

function check(expected: number, actual: number, descr: string) {
    if (expected === actual) {
        console.log(`-> PASSED ${descr} (expected = actual = ${actual})`);
    } else {
        console.log(`-> FAILED ${descr} (expected: ${expected}, actual: ${actual})`);
        process.exitCode = 1;
    }
}
