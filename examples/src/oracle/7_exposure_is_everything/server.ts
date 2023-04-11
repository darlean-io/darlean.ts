import { ConfigRunnerBuilder } from '@darlean/core';
import { knowledge } from './knowledge';
import webapi_suite from './webapi';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';
import { createWebserviceSuite } from '@darlean/webservice-suite';
import { createOracleSuite } from './oracle.suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(createOracleSuite(knowledge));
    builder.registerSuite(webapi_suite());
    builder.registerSuite(
        createWebserviceSuite(
            {
                hosts: [
                    {
                        id: 'default',
                        port: 8080,
                        actorType: 'WebApiService',
                        handlers: [
                            { path: '/ask/*/', actionName: 'ask' },
                            { path: '/teach', actionName: 'teach' },
                            { path: '/*', actionName: 'file' }
                        ]
                    }
                ]
            },
            builder.getAppId()
        )
    );
    const runner = builder.build();
    await runner.start();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
