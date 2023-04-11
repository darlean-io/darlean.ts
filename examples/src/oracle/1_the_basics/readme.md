# Darlean Tutorial: A Distributed Oracle

In this tutorial we will show how to use Darlean to create your (presumably) very first actor-oriented program. We highlight the basics; illustrate good practices like decoupling implementation and invocation by means of service actors; explain persistence; show how easy it is to scale up; and discuss advanced topics like the multi-follower pattern.

# Part 1 - The basics

In this tutorial, we will implement a simple oracle that can answers questions like "What was the temperature of yesterday" and "What is the price of milk". What makes this oracle unique is that it is fully scalable, right from the beginning. For simplicity, the first parts of the tutorial will assume a single all-in-one application deployment. But starting in [part 4](../4_scale_it_up/), we will make the move towards multiple separate applications that can be deployed multiple times to achieve scalability and availability.

But let's start with the basics. For this tutorial, we assume that the knowledge of the oracle consists of (static) facts, and that knowledge is grouped into topics (like `temperature` and `price`). A fact contists of a keyword (like `yesterday` or `milk`) and a numeric answer (`19` or `2`, for example).

The knowledge of a rather small oracle could look as follows (see [knowledge.ts](knowledge.ts)):
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

The oracle is of course implemented using virtual actor technology. We will start by implementing one virtual actor type (the `OracleActor`) that contains the knowledge for one topic, and that you can ask questions about that one topic. The entire distributed oracle hence consists of multiple such actor instances, one per topic the oracle knows something about.

Actors are identified by their `id` (which is a `string[]`). We simple give every actor an `id` that consists of only one element: the topic. So, given our previous knowledge configuration, we have `OracleActor`s with id `['temperature']` and `['milk']`.

Each such actor knows the facts that correspond to their topic. The facts come from a configuration file ([knowledge.ts](knowledge.ts)), which is for the sake of simplicity a `.ts` file that we simply import, but
for real applications this would likely be a json configuration file that we would dynamically load from disk. The contents of the file is already listed above.

The answer that the oracle actor returns is the answer that corresponds to the first fact keyword from the actors knowledge that is contained as part of the asked question. So, when an actor knows `today = 20` and `tomorrow = 25`, 
and the question is `what is the temperature of tomorrow`, it will return `25` because the fact `tomorrow` is present in the question.

# Public interface

Actors are simply implemented as regular classes with methods. Methods that are decorated with `@action` are considered actions by the framework, and they can be invoked from other actors in the cluster.

Actors can invoke actions on other actors by means of a portal. A portal has a [retrieve](https://docs.darlean.io/latest/IPortal.html#retrieve) method that actors can use to obtain a proxy (stub) to another actor by providing the type name and id of the actor. The resulting stub acts as if it *is* the remote actor, so you can directly invoke (asynchronous) methods on the stub as if it were a regular, local object. The framework takes care of the underlying networking to make this all work. 

In order for actors to invoke methods on remote actors, we must define an interface type (otherwise, actors must have access to the implementating class of the remote actor, which is obviously what we would like avoid).

The interface of our `OracleActor` actor is defined in [oracle.intf.ts](oracle.intf.ts).

> Note: It is good practice to separate implementation from definition, that is why we place the `IOracleActor` interface in this separate file. That also allows one to invoke the actor from other applications, just by including this interface file (the other application would not require the actual implementation of the actor).

The interface is straight forward:
```ts
export interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}
```

An oracle actor has two (asynchronous) methods: one for asking questions (about the actor's topic), and one for teaching new facts. For this tutorial, we have made the simplification that the oracle only returns numeric answers (like temperatures or prices). When the oracle does not know the answer to a question, it will return 42, the answer to the [ultimate question](https://en.wikipedia.org/wiki/Phrases_from_The_Hitchhiker%27s_Guide_to_the_Galaxy#Answer_to_the_Ultimate_Question_of_Life,_the_Universe,_and_Everything_(42)).

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

We see here that actors are indeed just regular classes, with action methods decorated with `@action`. The actor's knowledge is passed via the constructor (which is a well-known dependency injection pattern that Darlean encourages you to use).

The `ask` method simply iterates over the known knowledge keys, finds the first one that is present in the question, and then returns the corresponding value (or `42` when there is no such fact).

The `teach` method simply adds the provided fact keyword and answer to the knowledge base Map object.

Nothing complicated here. The `OracleActor` really is just an ordinary class. We can create instances, invoke its methods, write unit tests around it. It is the framework that will later, after registration, turn it into an actor by wrapping it into an [IInstanceWrapper](https://docs.darlean.io/latest/IInstanceWrapper.html).

# Suite

To make it easy for a developer to register the actor with the framework, we also provide a `createOracleSuite` function in [oracle.suite.ts](oracle.suite.ts). This is like a factory function that receives all relevant configuration and preknowledge (in our case: the knowledge facts) as parameter, and returns an actor suite that consists of the `OracleActor`.

> Note: An actor suite is in essence just a list of actor definitions.

```ts
export function createOracleSuite(knowledge?: IKnowledgeTopics): IActorSuite {
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

The `createOracleSuite` function receives the knowledge as a parameter, and returns a new actor suite with one actor type in it: our oracle actor. The constant `ORACLE_ACTOR` contains the name of our actor under which it is known in the cluster: `'OracleActor'`. Other actors can use this name to retrieve a proxy to the actors of this type. To avoid typing errors, we use the constant `ORACLE_ACTOR` instead of the name `'OracleActor'`.

The actor is registered as `singular`, which means (in actor terminology) that there can never be more than 1 instance active within the entire cluster of an actor of the same type and id.

> The opposite of `singular` is `multiplar`, which means (in actor terminology) that the same actor *can* be active multiple times at the same time within the cluster. In general, singular actors are also known as *virtual* actors; multiplar actors are also known as *service* actors. But more on this in [Part 2](../2_oracle_as_a_service/).

The `creator` function is the heart of the suite. It is invoked by the framework when someone wants to invoke actions on an actor that does not (yet) exist in memory. The provided `context` object (see [IActorCreateContext](https://docs.darlean.io/latest/IActorCreateContext.html)) provides useful information, such as the `Id` for which a new actor instance should be created.

In our example, we use the `Id` field to determine the topic. Remember that we have committed ourselves to use the first field of the id to contain the topic, extracting the topic from the id is simple. We extract just the bit of knowledge for this one topic from our entire knowledge base, and pass this specific topic knowledge to the constructor of the `OracleActor`.

# The entry point

The entry point (main function) of our application is found in [index.ts](index.ts).

## Initialization

The following code from [index.ts](index.ts) configures a local actor runner to which the oracle suite is registered:
```ts
const builder = new ConfigRunnerBuilder();
builder.registerSuite(oracle_suite(knowledge));
const runner = builder.build();
```
The first and third line are quite standard; the second line is project specific and registers our actor suite to the framework.

The runner is now started via
```ts
await runner.start();
```

## Logic
The running of the example starts with obtaining a typed portal that provides access to `OracleActor` instances:
```ts
const oraclePortal = runner.getPortal().typed<IOracleActor>(ORACLE_ACTOR);
```

The `oraclePortal` is of the type `IOracleActor`, so we can can use it directly to ask queries or to teach new facts:
```ts
// Obtain a proxy to an actor of id `['temperature']` (remember, the
// first field of the id contains the topic name)
const temperatureOracle = oraclePortal.retrieve(['temperature']);
// And invoke an action method on the proxy
const todaysTemperature = await temperatureOracle.ask('What is the temperature of today?');
```

To test that our oracle work correctly, we have implemented some checks as business logic:
```ts
const oraclePortal = runner.getPortal().typed<IOracleActor>(ORACLE_ACTOR);

const temperatureOracle = oraclePortal.retrieve(['temperature']);
check(20, await temperatureOracle.ask('What is the temperature of today?'), "Today's temperature should be ok");
check(25, await temperatureOracle.ask('How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

const priceOracle = oraclePortal.retrieve(['price']);
check(2, await priceOracle.ask('What is the price of milk?'), 'The price of milk should be ok');
check(42, await priceOracle.ask('What is the price of an abracadabra?'), 'The price of an unknown product should be 42');

await priceOracle.teach('abracadabra', 99);

check(
    99,
    await priceOracle.ask('What is the price of an abracadabra?'),
    'A newly learned fact should be used by the oracle'
);
check(
    42,
    await temperatureOracle.ask('What is the price of an abracadabra?'),
    'Another oracle instance should not know about the facts of another oracle'
);
```

## Finalization
We have to clean things up (for example, to allow actors to persist their state in a nice way -- but in this example we do not yet have actors that need to persist anything):
```ts
await runner.stop();
```
## Configuration

The configuration for this example is provided in [config.json5](../../../config/oracle/allinone/config.json5):
```ts
// Minimal config file for an all-in-one application that contains both runtime and application actors
// in one single application.
{
    runtime: {
        // Ensures that this node provides the runtime functionality like the actor registry and actor lock to itself.
        enabled: true
    },
    messaging: {
        // Disable the NATS transport for this all-in-one setup. This will effectively use an in-process transport which
        // is sufficient for an all-in-one application.
        transports: []
    }
}
```

> Note: Darlean supports json5 files, which in addition to ordinary json files, allow comments and do not require keys to be surrounded by quotes.

The `example:oracle:1` script as defined in [package.json](../../../package.json) points the application to this script via the `--darlean-config` command line argument:
```
"example:oracle:1": "node lib/oracle/1_the_basics/index.js --darlean-config config/oracle/allinone/config.json5",
```

## Running

To start the example, first build, and then run from the root of this monorepo:
```
$ npm run install-workspaces
$ npm run example:oracle:1 -w examples
```

The output should look like:
```
PASSED Today's temperature should be ok (expected = actual = 20)
PASSED Tomorrow's temperature should be ok (expected = actual = 25)
PASSED The price of milk should be ok (expected = actual = 2)
PASSED The price of an unknown product should be 42 (expected = actual = 42)
PASSED A newly learned fact should be used by the oracle (expected = actual = 99)
PASSED Another oracle instance should not know about the facts of another oracle (expected = actual = 42)
```

# What's next?
So, we have implemented a very basic example of the use of actor technology. What can we improve?

In this very basic example, our custom code *directly* invokes the actual `OracleActor` actors. So, our application has knowledge about our actor *implementation*, which means we cannot
refactor our implementation without breaking existing software that uses our oracle. That is a bad practice.

We can fix this by hiding away the implementation behind a service. A service is just an ordinary actor, but with a different class name suffix (`Service` instead of `Actor`). A service actor hides the implementation 
details from the caller.

We will show how to implement the exact same oracle functionality using services in [Part 2 - Oracle as a Service](../2_oracle_as_a_service/).

