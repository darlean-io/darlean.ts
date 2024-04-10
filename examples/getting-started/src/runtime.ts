// src/runtime.ts:

import { ConfigRunnerBuilder } from "@darlean/core";
import { createRuntimeSuiteFromBuilder } from "@darlean/runtime-suite";

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
