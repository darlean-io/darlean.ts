import { ConfigRunnerBuilder } from '@darlean/core';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';
import { FileTracer, Tracer } from '@darlean/utils';
import { knowledge } from './knowledge';
import { createOracleSuite } from './oracle.suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(createOracleSuite(knowledge));
    const runner = builder.build();

    const tracer = new Tracer('app', builder.getAppId(), undefined, [
        { scope: 'io.darlean.timer-callback', id: 'Actor registry refresh' },
        { scope: 'io.darlean.timer-callback', id: 'Actor registry push' },
        { scope: 'io.darlean.remote.incoming-action', id: 'io.darlean.actorregistryservice::::push' },
        { scope: 'io.darlean.remote.incoming-action', id: 'io.darlean.actorregistryservice::::obtain' }
    ]);
    new FileTracer(tracer, builder.getAppId());
    // , {correlationIds: ['ROOT']}
    await tracer.newChildScope('runner', undefined, undefined).perform(async () => {
        await runner.run();
    });
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
