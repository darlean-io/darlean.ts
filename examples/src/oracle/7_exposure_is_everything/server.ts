import { ConfigRunnerBuilder } from '@darlean/core';
import { knowledge } from './knowledge';
import oracle_suite from './oracle.suite';
import webservice_suite from '@darlean/webservice-suite';
import webapi_suite from './webapi';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(oracle_suite(knowledge));
    builder.registerSuite(webapi_suite());
    builder.registerSuite(
        webservice_suite(
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
