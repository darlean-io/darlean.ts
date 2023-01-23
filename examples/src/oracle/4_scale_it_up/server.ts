import { ConfigRunnerBuilder } from '@darlean/core';
import { knowledge } from './knowledge';
import oracle_suite from './oracle.suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge));
    const runner = builder.build();

    await runner.run();
    console.log('RUNNER STOPPED');
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
