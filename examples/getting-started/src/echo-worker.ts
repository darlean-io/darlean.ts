// src/echo-worker.ts:

import { ConfigRunnerBuilder } from "@darlean/core";
import { createEchoSuite } from "./echo-suite";

async function main() {
    const builder = new ConfigRunnerBuilder();
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
