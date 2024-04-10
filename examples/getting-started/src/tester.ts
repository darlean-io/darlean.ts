// src/tester.ts:

import { ConfigRunnerBuilder } from "@darlean/core";
import { ECHO_SERVICE, IEchoService } from "./echo-suite";

async function main() {
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
    await runner.start();

    try {
        const echoService = runner.getPortal().typed<IEchoService>(ECHO_SERVICE).retrieve([]);

        const commands = ['echo', 'history', 'delete'];
        const commandIdx = process.argv.findIndex((arg) => commands.includes(arg));
        const command = process.argv[commandIdx];
        switch (command) {
            case 'echo': {
                const name = process.argv[commandIdx + 1] ?? 'Alice';
                const message = process.argv[commandIdx + 2] ?? 'Hello!';
                console.log(await echoService.echo(name, message));
                break;
            }
            case 'history': {
                const name = process.argv[commandIdx + 1] ?? 'Alice';
                console.log(await echoService.getHistory(name));
                break;
            }
            case 'delete': {
                const name = process.argv[commandIdx + 1] ?? 'Alice';
                await echoService.delete(name);
                break;
            }
            default: {
                console.log('Please provide valid arguments.')
                console.log('npm run start:tester echo <name> <message>');
                console.log('npm run start:tester history <name>');
                console.log('npm run start:tester delete <name>');
                break;
            }
        }
    } finally {    
        await runner.stop();
    }
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
