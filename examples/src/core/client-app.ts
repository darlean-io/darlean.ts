import { ConfigRunnerBuilder } from '@darlean/core';
import { IEchoActor, ECHO_ACTOR } from './echosuite';
import { fetchConfigString } from '@darlean/utils';

async function main(name: string, message: string) {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    const actor = runner.getPortal().retrieve<IEchoActor>(ECHO_ACTOR, [name]);
    const result = await actor.echo(message);
    console.log(result);

    await runner.stop();
}

if (require.main === module) {
    const name = fetchConfigString('NAME', '--name') ?? 'No name';
    const message = fetchConfigString('MESSAGE', '--message') ?? 'No message';
    main(name, message)
        .then()
        .catch((e) => console.log(e));
}