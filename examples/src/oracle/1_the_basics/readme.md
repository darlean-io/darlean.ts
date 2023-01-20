# Distributed Oracle - Part 1 - The basics

This example illustrates the implementation of a simple oracle that can answers questions like "What was the temperature of yesterday" and "What is the price of milk".

We assume that knowledge consists of (static) facts, and that knowledge is grouped into topics (like `temperature` and `price`). A fact contists of a keyword (like `yesterday` or `milk`) and
a numeric answer (`19` or `2`, for example).

```ts
{
    temperature: {
        yesterday: 19,
        today: 20,
        tomorrow: 25
    },
    price: {
        milk: 2,
        bike: 250,
        wine: 15
    }
}
```

The oracle is of course implemented using virtual actor technology. To make things a bit interesting, we decided not to put all facts for all topics into 1 `OracleActor` instance, but to have
multiple `OracleActor` instances, one for each topic.

Actors are identified by their `id` (which is a `string[]`). We simple give every actor an `id` that consists of only one element: the topic. So, we have `OracleActor`s with id `['temperature']` and
`['milk']`.

Each such actor knows the facts that correspond to their topic. The facts come from a configuration file (`config.ts`), which is for the sake of simplicity a `.ts` file that we simply import, but
for real applications this would likely be a json configuration file that we would dynamically load from disk.

The answer that the oracle actor returns is the answer that corresponds to the first fact keyword from the actors knowledge that is contained as part of the asked question. So, when an actor knows `today = 20` and `tomorrow = 25`, 
and the question is `what is the temperature of tomorrow`, it will return `25` because the fact `tomorrow` is present in the question.

# Public interface

The public interface of the actor is defined in [oracle.intf.ts](oracle.intf.ts). It is good practice to separate implementation from definition, that is why we place the `IOracleActor` interface in this separate file. That
also allows one to invoke the actor from other applications, just by including this interface file (the other application would not require the actual implementation of the actor).

The interface is straight forward:
```ts
export interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}
```

An oracle actor has two (asynchronous) methods: one for asking questions (about the actor's topic), and one for teaching new facts.

# Implementation

The implementation of the actor is in [oracle.actor.ts](oracle.actor.ts).

```ts
export class OracleActor implements IOracleActor {
    protected knowledge: Knowledge;

    constructor(knowledge?: Knowledge) {
        this.knowledge = knowledge ?? {};
    }

    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge)) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        this.knowledge[fact] = answer;
    }
}
```

The actor's knowledge is passed via the constructor (which is a typical dependency injection pattern that is heavily used within Darlean). The `ask` method simply
iterates over the known knowledge keys, finds the first one that is present in the question, and then returns the corresponding value (or `42` when there is no such fact). The `teach` method simply adds the provided
fact keyword and answer to the knowledge base Map object.

# Suite

To make it easy for a developer to use the actor, we also provide a `suite` function in [oracle.suite.ts](oracle.suite.ts) that receives all knowledge facts as parameter, and returns an actor suite that consists of the `OracleActor`:
```ts
export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        {
            type: ORACLE_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const topic = context.id[0];
                const k = topic ? knowledge?.[topic] : undefined;
                return new OracleActor(k);
            }
        }
    ]);
}
```

# The example

The example basically is like a mini-application which is found in [index.ts](index.ts). It consists of 3 parts, initialization and the actual logic and finalization.

## Running

To start the example, first build, and then run from the root of this monorepo:
```
$ npm run build --workspaces
$ npm run example:oracle:1 -w examples
```

## Initialization

The following code from [index.ts](index.ts) configures a local actor runner to which the oracle suite is registered:
```ts
const builder = new ConfigRunnerBuilder();
builder.registerSuite(oracle_suite(knowledge));
const runner = builder.build();
```

The runner is now started via
```ts
await runner.start();
```

## Logic
The running of the example starts with obtaining a typed portal that provides access to `OracleActor` instances:
```ts
const oraclePortal = runner.getPortal().typed<IOracleActor>(ORACLE_ACTOR);
```

The `oraclePortal` can now be used to ask queries or to teach new facts:
```ts
const temperatureOracle = oraclePortal.retrieve(['temperature']);
const todaysTemperature = await temperatureOracle.ask('What is the temperature of today?');
```

## Finalization
We have to clean things up (for example, to allow actors to persist their state in a nice way -- but in this example we do not yet have actors that need to persist anything):
```ts
await runner.stop();
```
## configuration
The configuration for this example is provided in [config.json5](../../config/oracle/allinone/config.json5).

The script as defined in package.json points the application to this script:
```
"example:oracle:1": "node lib/oracle/1_the_basics/index.js --darlean-config config/oracle/allinone/config.json5",
```

# What's next?
So, we have implemented a very basic example of the use of actor technology. What can we improve?

In this very basic example, our custom code *directly* invokes the actual `OracleActor` actors. So, our application has knowledge about our actor *implementation*, which means we cannot
refactor our implementation without breaking existing software that uses our oracle. That is a bad practice.

We can fix this by hiding away the implementation behind a service. A service is just an ordinary actor, but with a different class name suffix (`Service` instead of `Actor`). A service actor hides the implementation 
details from the caller.

We will show how to immplement the same oracle using services in [Part 2 - Oracle as a Service](../2_oracle_as_a_service/).

