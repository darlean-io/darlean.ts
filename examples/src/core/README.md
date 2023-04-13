# Example: Usage of @darlean/core

We illustrate the usage of `@darlean/core` by means of a minimal distributed application that provides
* An echo application that hosts an `EchoActor` that simply echoes back messages that it receives
* A Darlean runtime application (which provides functionality like the actor lock and actor registry). Darlean cannot work without runtime functionality.
  In this example, we create the runtime as a separate application, but for simple applications it is also possible to include the runtime functionality
  in the echo application. In that case, a separate runtime application is not necessary. 
* A client command-line application that invokes the echo actor.

## Creating an actor application

The following code snippet creates a Darlean application that hosts one or more custom actors:

`echo-app.ts`:
```ts
import { ConfigRunnerBuilder } from '@darlean/core';
import { createEchoSuite } from './echosuite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite( createEchoSuite() );  // <-- Registers the custom actor suite
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
```

What this very simple program does is:
* It creates a new [ConfigRunnerBuilder](https://docs.darlean.io/latest/ConfigRunnerBuilder.html) instance. A config-runner-builder is a class that builds an
  [ActorRunner](https://docs.darlean.io/latest/ActorRunner.html#) from the configuration that is present as JSON/JSON5 file on disk, that is present as
  command-line arguments and/or that is present via environment variables. Click [here](https://darlean.io/documentation/configuration-options/) for documentation 
  about configuring Darlean and all the configuration options that are available.
* It registers the actors from the 'echo suite'. The echo suite is an actor suite for which we show the source code below. It contains an actor that simple
  echoes back what it receives.
* It builds the runner
* It starts the runner and waits until the runner stops running (which is when the application is killed or when the [run file is deleted](https://darlean.io/documentation/starting-and-stopping/)).

## Defining an actor

The above snippet contains a reference to the `createEchoSuite` function in `./echosuite`. A simple implementation is shown here:

`echosuite.ts`:
```ts
import { action, ActorSuite, IActorSuite } from '@darlean/base';

export const ECHO_ACTOR = 'demo.EchoActor';

export interface IEchoActor {
    echo(value: string): Promise<string>;
}

class EchoActor implements IEchoActor {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    @action()
    public async echo(value: string): Promise<string> {
        return `${name} echoes: ${value}`;
    }
}

export function createEchoSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: ECHO_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const name = context.id[0];
                return new EchoActor(name);
            }
        }
    ]);
}
```

Notes:
* The actor suite itself does not depend on `@darlean/core`. The `@darlean/core` package is only for creating applications that host actors.
  The actor implementations themselves do not require all of this functionality.
* Every actor has an Id, which is a `string[]`. For the echo actor, we assume that the Id has a length of 1, and that the only element
  contains the name of the acho actor. That is why we have `const name = context.id[0]` to extract the name from the id.
* The actor is defined as a `singular`, which means that there will never more than one active instance of an echo actor with a specific Id
  within the entire cluster. For this example it would not matter if there were more than one active instance allowed (which is called
  `multiplar`).
* The `IEchoActor` interface is exported (so that it can be used by other code), but the implementing `EchoActor` class is not exported.
  There is no need to. The exported `createEchoSuite` is sufficient for other code to instantiate a new echo suite.


## Creating a runtime application

In order to run our example, we also need a runtime application that provides basic functionality like the actor lock and actor registry.

`runtime-app.ts`:
```ts
import { ConfigRunnerBuilder } from '@darlean/core';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder)); // <-- Registers the runtime suite
    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
```

The code is very similar to the previous application. The differences are:
* We do not need to host the echo suite (that is already done by the basic application)
* We register the various runtime suites that provide the runtime functionality

> Note: Instead of having created a separate `runtime-app.ts` application for the runtime, we could also have integrated runtime functionality
in the `echo-actor.ts` application by adding the line `builder.registerSuite(createRuntimeSuiteFromBuilder(builder));` to `echo-actor.ts`. That
simplifies the deployment for small applications. For larger applications, it is recommended to place the runtime in its own application.

## Creating a client application

Now that we have defined the applications that host the echo actor and that provide the runtime, we also need a client application that
interacts with these applications.

`client-app.ts`:
```ts
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
    const name = fetchConfigString('NAME', '--name');
    const message = fetchConfigString('MESSAGE', '--message');
    main(name, message)
        .then()
        .catch((e) => console.log(e));
}
```

## Running

First, compile the typescript files to javascript using [tsc](https://www.typescriptlang.org/docs/handbook/compiler-options.html).

Then, Start up the runtime and echo applications:
```
$ node runtime-app.js --darlean-appid=runtime --darlean-runtimeapps=runtime
$ node echo-app.js --darlean-appid=echo --darlean-runtimeapps=runtime
```

Run the client application
```
$ node client-app.js --darlean-appid=client --darlean-runtimeapps=runtime --name=Foo --message=Hello
```

Expected output:
```
Foo echoes: Hello
```