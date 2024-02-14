import { ConfigRunnerBuilder } from '@darlean/core';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';
import { recycleActorSuite, recycleActorSuiteWithMaxAge } from './actor.impl';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(recycleActorSuite(builder.getAppId()));
    builder.registerSuite(recycleActorSuiteWithMaxAge(builder.getAppId()));
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
