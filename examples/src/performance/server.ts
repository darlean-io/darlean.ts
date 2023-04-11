import { ConfigRunnerBuilder } from '@darlean/core';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';
import { FileTracer, Tracer } from '@darlean/utils';
import { static_suite, virtual_suite } from './actor.impl';

async function main() {
    const tracer = new Tracer(undefined, undefined, undefined, []);

    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    const toFile = new FileTracer(tracer, builder.getAppId());

    builder.registerSuite(static_suite());
    builder.registerSuite(virtual_suite());
    const runner = builder.build();
    await runner.run();
    toFile.dump();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
