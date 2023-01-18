import { suite as oracle_suite } from './oracle.impl';
import { knowledge } from './knowledge.cfg';
import { ConfigRunnerBuilder } from '@darlean/core';
import { config } from './persistence.cfg';

async function main() {
    const builder = new ConfigRunnerBuilder(config());
    builder.registerSuite(oracle_suite(knowledge));

    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
