import { ConfigRunnerBuilder } from '@darlean/core';
import { knowledge } from './knowledge';
import webapi_suite from './webapi';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';
import { createOracleSuite } from './oracle.suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(createOracleSuite(knowledge));
    builder.registerSuite(webapi_suite());
    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
