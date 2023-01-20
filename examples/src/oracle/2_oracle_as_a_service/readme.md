# Distributed Oracle - Part 2 - Oracle as a Service

In [Part 1](../1_the_basics) of this tutorial, we have created a very basic distributed oracle with one virtual actor (`OracleActor`) that was directly invoked by the
application code in `index.ts`. Although this worked, from a software architecture point of view it is not very nice to directly invoke the virtual actor (which is basically implementation
code) from your application logic. In this part of the tutorial we show you why this is, and how to solve it.

## Decoupling of application code and implementation

In software engineering, it is good practice to decouple (hide) implementation code from the application logic. In traditional object-oriented programming, this is often achieved by means of interfaces.
Interfaces define the *contract* of an implementation, so that application logic does not have to know or be linked with the actual implementation. The interface effectively hides the implementation
from the application logic.

The advantage is that it is possible to refactor the implementation (for example, to rename objects, or to split them up) without affecting the application logic.

The same principle holds for actor-oriented programming. For many reasons, it may become necessary to refactor the underlying virtual actors. For example, you may not be happy anymore with their name. Or
you need to implement new functionality, for which we find out it is better to put it in a separate actor.

Considering our distributed Oracle, future might teach us that besides representing knowledge as simple facts, there could be other types of knowledge that are better represented by means of API calls
to web services. For example, the `temperature` facts that are now represented as static facts might be better represented by means of a live web call to [weather.com](weather.com). As a result, we may want to create
a new actor type, `WebApiOracleActor`, and then it makes sense to also rename our existing `OracleActor` into `FactOracleActor` (as it uses static facts to represent its knowledge).

Without decoupling of application code and implementation, we would have to adjust all of our application logic that queries the Oracle. And although that is still possible to do, the situation becomes worse 
when also other applications have started to rely on our Oracle functionality. Adjusting all of those (possibly external) applications is a no-go.

## Service actors

The recommended way of decoupling implementation from application code is by means of *service actors*. Service actors are (implementation wise) just regular actors. The only differences are:
* Service actors typically have `Service` as a suffix of the actor type (instead of `Actor` which is the typical suffix for regular, virtual actors)
* Service actors typically have `multiplar` configured as value of `kind`, which means that there can be multiple instances of the same service actor in the cluster.
* Service actors typically do not hold state by themselves. They normally just forward incoming calls to the proper underlying virtual actor and return the result.

The interface of service actors (that is, their name and which actions they support and with which parameters) should be quite stable, as it will be used by application code.

## The code

The code for this example is based on the code of part 1 of this tutorial. In fact, the code in [knowledge.ts](knowledge.ts) and [oracle.actor.ts](oracle.actor.ts), the actual implementation
of the underlying actor, did not have to change at all.

### The service implementation

What is new is the [oracle.service.ts](oracle.service.ts) file, which defines the `OracleService` actor:
```ts
export class OracleService implements IOracleService {
    protected actorPortal: ITypedPortal<IOracleActor>;

    constructor(actorPortal: ITypedPortal<IOracleActor>) {
        this.actorPortal = actorPortal;
    }

    @action()
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action()
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
```

As we can see, this is, implementation wise, just a regular actor with two methods: `ask` and `teach`. They serve the same purpose of the corresponding
methods of the `OracleActor`, but they have an additional parameter that defines the `topic` of the question. Application code should hence not only
provide the question itself, but also the topic to which the question relates. (In a future version, we might implement some AI to automatically derive
the topic from the question, but we leave that as an excercise to the reader.)

The implementation of `ask` and `teach` is straight forward: they use the `actorPortal` that is provided in the constructor of the object to retrieve a
proxy (stub) to the underlying virtual `OracleActor` actor for the provided topic, and then invoke the corresponding method on the proxy.

### The service interface

We also see that the actor implements `IOracleActor`. That makes it possible for application code to invoke actions on our actor without needing to have
access to the implementation. The interface is defined as follows ([oracle.intf.ts](oracle.intf.ts)):
```ts
export interface IOracleService {
    ask(topic: string, question: string): Promise<number>;
    teach(topic: string, fact: string, answer: number): Promise<void>;
}
```

### The suite function

Now that we have two different types of actors in our suite (`OracleActor` and `OracleService`), we have to adjust our suite function in [oracle.suite.ts](oracle.suite.ts)
to register both types:
```ts
export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        // Registration of the OracleActor virtual actor
        {
            type: ORACLE_ACTOR,
            // Singular: there is only one actor instance active at any moment for the same actor type and id
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Lookup relevant facts for the topic in the knowledge
                const k = topic ? knowledge?.[topic] : undefined;
                // Create and return a new OracleActor instance with the provided knowledge
                return new OracleActor(k);
            }
        },
        // Registration of the OracleService service actor
        {
            type: ORACLE_SERVICE,
            // Multiplar: there can be more than one actor instance active at any moment for the same actor type and id
            kind: 'multiplar',
            creator: (context) => {
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor instances
                const actorPortal = context.portal.typed<IOracleActor>(ORACLE_ACTOR);
                // Create and return a new OracleService with the typed portal
                return new OracleService(actorPortal);
            }
        }
    ]);
}
```

The definition of the `OracleActor` is the same as in part 1; the definition of the `OracleService` is new. It defines the actor as
a `multiplar`, which means that more than once instance is the same actor can be active within the cluster. This is a simple way of
achieving load balancing, and it does not cause any issues because the `OracleService` itself does not store state, so it is no issue
of having multiple of the same instance active at one moment.

The `creator` factory function first takes the generic portal (`context.portal`), and then derives a sub-portal of the `IOracleActor`
type. The sub-portal is passed to the constructor of the `OracleService`.

Note: It is generally considered good practice to supply objects with the least amount of dependencies that they
need to function properly. The same holds for actor implementations. Although it would be possible to give the generic portal
(`context.portal`) to the `OracleService`, the service only needs access to instances of `IOracleActor`, so it is better to give
it a sub-portal for only this specific actor type.

### The application code

Lastly, we have to adjust our application code in [index.ts](index.ts) to invoke our new service (instead of directly invoking the underlying actor):
```ts
    const oraclePortal = runner.getPortal().typed<IOracleService>(ORACLE_SERVICE);
    const oracleService = oraclePortal.retrieve([]);

    check(
        20,
        await oracleService.ask('temperature', 'What is the temperature of today?'),
        "Today's temperature should be ok"
    );
    check(25, await oracleService.ask('temperature', 'How warm is it tomorrow?'), "Tomorrow's temperature should be ok");

    check(2, await oracleService.ask('price', 'What is the price of milk?'), 'The price of milk should be ok');

    // et cetera
```

So, instead of asing `runner.getPortal` for an `IOracleActor`, we ask for `IOracleService`, and then obtain a proxy to
the 'default instance' of that service. Because we only have one oracle in our system, we just provide it with an empty
array (`[]`) as id.

The checks now all operate on this `oracleService` proxy, regardless of the topic. The topic is simply passed as first
argument to the `ask` method.

## What's next?

We have made a great step towards software quality by having the implementation hidden from the application code
by means of a service actor. But we're not done yet: When our `OracleActor`s die (for example because they have
to reincarnate on another node, or because the cluster is stopped), they lose all of their learned facts.

In [Part 3 - Do not Forget](../3_do_not_forget), we show you how to add persistence to our actors.