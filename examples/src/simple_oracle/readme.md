# Introduction

This example illustrates the implementation of a simple oracle that can answers questions like "What was the temperature of yesterday" and "What is the price of milk".

We assume that knowledge is grouped into topics (like `temperature` and `price`), and that per topic, we have some facts. A fact contists of a keyword (like `yesterday` or `milk`) and
a numeric answer (`19` or `2`, for example).

The oracle is of course implemented using virtual actor technology. To make things a bit interesting, we decided not to put all facts for all topics into 1 `OracleActor` instance, but to have
multiple `OracleActor` instances, one for each topic.

Actors are identified by their `id` (which is a `string[]`). We simple give every actor an `id` that consists of only one element: the topic. So, we have `OracleActor`s with id `['temperature']` and
`['milk']`.

Each such actor knows the facts that correspond to their topic. The facts come from a configuration file (`config.ts`), which is for the sake of simplicity a `.ts` file that we simply import, but
for real applications this would likely be a json configuration file that we would dynamically load from disk.

The answer that the oracle actor returns is the answer that corresponds to the first fact keyword from the actors knowledge that is contained as part of the asked question. So, when an actor knows `today = 20` and `tomorrow = 25`, 
and the question is `what is the temperature of tomorrow`, it will return `25` because the fact `tomorrow` is present in the question.

# Public interface

The public interface of the actor is defined in `oracle.intf.ts`. It is good practice to separate implementation from definition, that is why we place the `IOracleActor` interface in this separate file. That
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

The implementation of the actor is in `oracle.impl.ts`. The actor's knowledge is passed via the constructor (which is a typical dependency injection pattern that is heavily used within Darlean). The `ask` method simply
iterates over the known knowledge keys, finds the first one that is present in the question, and then returns the corresponding value (or `42` when there is no such fact). The `teach` method simply adds the provided
fact keyword and answer to the knowledge base Map object.

To make it easy for a developer to use the actor, the implementation also provides a `suite` function that receives all knowledge facts as parameter, and returns an actor suite that consists of the `OracleActor`.

# The example

The example basically is like a mini-application which is found in `index.ts`. It consists of 3 parts, initialization and the actual logic and finalization.

## Running

To start the example, first build, and then run:
```
$ npm run build
$ npm run example:simple_oracle
```

## Initialization

The following code configures a local actor runner to which the oracle suite is registered:
```ts
const builder = new ActorRunnerBuilder();
builder.registerSuite(oracle_suite(knowledge));
const runner = builder.build();
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

# Discussion & Improvements
So, we have implemented a very basic example of the use of actor technology. What can we improve?

## Use of a service

In this simple example, our custom code *directly* invokes the actual `OracleActor` actors. So, our application has knowledge about our actor *implementation*, which means we cannot
refactor our implementation without breaking existing software that uses our oracle. That is a bad practice.

We can fix this by hiding away the implementation behind a service. A service is just an ordinary actor, but it hides the implementation details from the caller. We will show how to
implement the same oracle using services in the `oracle_with_service` example.

## Use of persistence

In this simple example, we use preconfigured facts, and also add some runtime facts using the `teach` action. But, when an `OracleActor` is deactivated (for example because it is automatically
recycled because the configured maximum amount of alive actors is reached -- this to reduce resource usage), and reactivated later on, it loses all learned facts. We will show how to
solve this in the `oracle_with_persistence` example, which includes both the service architecture as well as persistency.

