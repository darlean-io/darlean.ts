import { ConfigRunnerBuilder } from '@darlean/core';
import { createEchoSuite } from './echosuite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createEchoSuite()); // <-- Registers the custom actor suite
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
