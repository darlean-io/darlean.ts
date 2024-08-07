// src/index.ts:

import { ConfigRunnerBuilder } from "@darlean/core";
import { createRuntimeSuiteFromBuilder } from "@darlean/runtime-suite";
import { createEchoSuite } from "./echo-suite";

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(createEchoSuite());
    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
