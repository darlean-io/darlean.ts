import { ConfigRunnerBuilder } from '@darlean/core';
import { createTablesSuite } from '@darlean/tables-suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    //builder.registerSuite(testActorSuite());
    builder.registerSuite(createTablesSuite());
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
