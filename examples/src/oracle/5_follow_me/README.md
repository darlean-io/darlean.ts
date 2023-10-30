# Distributed Oracle - Part 5 - Follow me

In [Part 4](../4_scale_it_up/) of this tutorial, we made the move from a single all-in-one application towards a scalable client-server solution. For our distributed oracle, every knowledge topic is covered by one virtual actor. So, the system is very scalable when it comes to having a lot of topics. As long as not all users want to know something about the same topic at the same moment, we are very scalable.

Users come in via the `OracleService` actor, which is deployed as `multiplar`. That means that this actor is not restricted to run in a single application at a given moment, so the load to the oracle service actors will be distributed over all available applications. So, no performance bottleneck here, and if there were a performance bottleneck, it could easily be solved by deploying more application instances.

*It is only the underlying `OracleActor` that is a `singular` that can be a bottleneck.*

Luckily, there are many applications in which the very straight forward approach we have implemented so far does *not* impose a bottleneck:
* A 'shopping cart' in an online shop. Although thousands of users could be active in the shop (and at the same time be hammering the `ShoppingCartService` actor), only one or two browser sessions will at the same time operate on the same underlying `ShoppingCartActor`. So, the underlying singular shopping cart actor does not pose a performance bottleneck here.
* The 'holiday house' in an application that provides cleaners the information which houses need to be cleaned. Like with the previous example, hundreds of cleaners may hammer the `HolidayHouseService` multiplar actor at the same time, but only very few of them will be working on the same house at a time, so only few of them will access the underlying `HolidayHouseActor` at the same time.

## All together now

So, not all situations actually impose any performance issues. Only when *many* people access the same *singular* actor all together at the same time, there may be an issue.

Some examples:
* A news web site where many readers may access the same underlying `NewsItemActor` at the same time.
* A blog site where many readers access the same underlying `BlobPostActor` at the same time.

What these examples have in common, is that *many* people perform *read* operations at the same time, but only *few* people perform *write* operations at the same time. For example, many people read a news item, but there is only one editor making changes. And this is not just true for these 2 examples, this holds for the large majority of real-world situations.

## The multi-follower pattern

So, what can we do to solve this? We just do what many database systems do as well to perform their duplication: We create one *controller* actor that is in control of the data, and multiple *follower* actors that can read the data, but cannot make changes.

In this part of the tutorial, we solve this in a simple way by having the follower actors fetch the facts from the controller actor every 10 seconds. In the [next part](../6_wait_a_while/), we show a more sophisticated way of doing this that gives the follower instant access to updates on the controller.

We still use one `OracleActor` class to represent both controller and follower roles. We use the id to differentiate between the two roles:
* A controller actor has an id that contains only the topic: `['temperature']`
* A follower actor has an id that contain both the topic and an instance number: `['temperature', '99']`.

> Note: Id parts must always be strings, so we must convert the number `99` to the string `'99'`.

## The oracle actor

So, we have to adjust our `OracleActor` in [oracle.actor.ts](oracle.actor.ts).

To start, we add a refresh timer that is required when the actor acts as a follower:
```ts
export class OracleActor implements IOracleActor, IActivatable, IDeactivatable {
    protected refreshTimer: IVolatileTimer;
    ...
```

When our actor acts as a follower, it needs access to the controller actor (and must set a refresh timer). When our actor acts as a controller, it does not need a controller (it is a controller by itself). So, we allow `controller` to also be `undefined`. An actor can check whether it is a controller or a follower by checking whether the `controller` is undefined or not.
```ts
    constructor( persistable: IPersistable<Knowledge>, controller: IOracleActor | undefined, refreshTimer: IVolatileTimer ) {
        this.knowledge = persistable;
        this.controller = controller;
        this.refreshTimer = refreshTimer;
    }
```

> Note: Like everywhere in darlean, we follow the pattern of constructor dependency injection here. The persistable, controller and refresh timer are all injected. That keeps the actor itself clean with as little dependencies as possible.

We must change our activation logic. When we are a controller, nothing changes. But when we are a follower, we must not load the data from the *persistence*, but instead fetch it from the controller. And we must start our refresh timer.
```ts
public async activate(): Promise<void> {
        if (this.controller) {
            // We are a follower.
            // Fetch the latest knowledge from our controller and assign it to this.knowledge
            this.knowledge.change(await this.controller.fetch());
            // Start the refresh timer that will invoke this.refetch() every 10 seconds.
            this.refreshTimer.repeat(this.refetch, 10 * 1000);
        } else {
            // We are a controller. Load our knowledge from the perisstence.
            (await this.knowledge.load()) ?? {};
        }
    }
```

The `deactivate` only should store our knowledge when we are a controller:
```ts
    public async deactivate(): Promise<void> {
        if (!this.controller) {
            // We are a controller
            await this.knowledge.persist();
        }
    }
```

The `ask` method remains unchanged:
```ts
    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge.tryGetValue() ?? {})) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }
```

But the `teach`, we have to adjust. In theory it could remain unchanged, because it should only be invoked when we are a controller. But let's be defensive, and throw an error when we are a follower:
```ts
    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        if (this.controller) {
            throw new Error('You can only teach a controller');
        }

        const knowledge = this.knowledge.tryGetValue() ?? {};
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        await this.knowledge.persist();
    }
```

When we are a controller, we have to provide the `fetch` action method, so that controllers can fetch our data:
```ts
    @action()
    public async fetch(): Promise<Knowledge> {
        return this.knowledge.tryGetValue() ?? {};
    }
```

And when we are a follower, we must implement the `refetch` method that is invoked by the refresh timer every 10 seconds as long as we are active:
```ts
    @timer()
    public async refetch(): Promise<void> {
        if (this.controller) {
            this.knowledge.change(await this.controller.fetch());
        }
    }
```
> Note: Methods that handle timer actions are called *timer methods*. They should be decorated with `@timer` instead of `@action`.

And that's it for our actor.

> Note: You may have noticed that there are quite some `if`-statements in this code. That is an indication that our actor is in fact doing two different things: it can behave as a controller, 
and it can behave as a follower. That makes the code a bit messy. In the [next part](../6_wait_a_while/) of this tutorial, we will refactor this and split up the `OracleActor` in an
`OracleControllerActor` and an `OracleFollowerActor`. Three times hooray for our prior choice of [implementing a service actor](../2_oracle_as_a_service/) around the `OracleActor`, which allows
us to do this refactoring without breaking any of the client code! But more on that in [Part 6](../6_wait_a_while/).

## The service actor

We also have to adjust our service actor in [oracle.service.ts](oracle.service.ts) to choose whether to invoke a controller actor, or one of the follower actors.

For a call to `teach`, the service invokes the controller actor, because this action modifies our internal state, and the controller actor is responsible for the state. Remember that invoking a
controller actor simply means providing an id with just the topic (so without an instance number).

```ts
    @action({locking: 'shared'})
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the controller OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
```

For a call to `ask`, the service invokes one of the follower actors. To determine which one should be invoked, we define a constant
```ts
const NR_FOLLOWERS = 100;
```
and simply draw a random number between `0` and `NR_FOLLOWERS` to determine the instance id. Darlean will reuse a previously created actor
with the same instance id, or create a new actor if it is the first time an actor with that instance id is invoked.
```ts
    @action({locking: 'shared'})
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to a random follower OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic, Math.floor(Math.random() * NR_FOLLOWERS).toString()]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }
```

## The suite
Last but not least, we have to adjust our suite in [oracle.suite.ts](oracle.suite.ts) to inject the proper dependencies into our actor. The registration for the service actor does not change. 
The registration for the `OracleActor` becomes:
```ts
    {
        type: ORACLE_ACTOR,
        kind: 'singular',
        creator: (context) => {
            const topic = context.id[0];
            const k = topic ? knowledge?.[topic] : undefined;
            const p = context.persistence<Knowledge>('oracle.fact.knowledge');
            // Derive a persistable instance with the provided default knowledge
            const persistable = p.persistable(['knowledge'], undefined, k ?? {});
            // Create a reference to the controller (when we are a follower -- which is when our id contains more than 1 part)
            const controller =
                context.id.length > 1 ? context.portal.retrieve<IOracleActor>(ORACLE_ACTOR, [context.id[0]]) : undefined;
            // Create the refresh timer that the follower actor uses to refresh its data from the controller
            const timer = context.newVolatileTimer();
            // Create and return a new OracleActor instance with the provided persistable, controller and timer
            return new OracleActor(persistable, controller, timer);
        }
    },
```

## Adjusting the test code

That's it! We can now run our test code. But, to really see what's happening, let's make some adjustments first in [client.ts](client.ts).

We have implemented polling for updated knowledge every 10 seconds. When we want to test that mechanism, we must first,
before teaching our new fact, ensure that all 100 followers are already active. Otherwise, one of them would be activated
when we perform the test, and it then would fetch the most recent knowledge directly from the `activate` method, and not
via the timer callback.

So, let's invoke 1000 `ask` requests with 100 at the same time in parallel, assuming that luck is with us and that 1000
request are enough to ensure that each of our 100 followers did at least receive 1 request:
```ts
    console.log('Ensure all read actors are active. Fire 1000 questions with 100 in parallel.');
    const tasks: ParallelTask<number, void>[] = [];
    for (let i = 0; i < 1000; i++) {
        tasks.push(() => oracleService.ask('price', 'What is the price of an abracadabra?'));
    }
    await parallel(tasks, 10 * 1000, 100);
```
What we see here is the [parallel](https://docs.darlean.io/latest/@darlean_utils.html#parallel) function in action. It is provided
as part of the [@darlean/utils](https://docs.darlean.io/latest/@darlean_utils.html) package, and can perform a list of tasks in
parallel, collecting all results (and possibly failures) on the fly.

The remaining of the business logic remains unchanged.

Now we can run the example:
* `$ npm run example:oracle:5:cluster3` - Deletes persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:5:cluster3:reuse` - Keeps persistence folder and runs the client and 1 server

## What's next?

We now have a rather elegant way of implementing a very high level of concurrency via the multiple-follower pattern. What is still a bit of a bummer is that
our refresh timer fires every 10 seconds, which means that we do not respond instantly to updates in our knowledge. For some applications that is no issue,
but there are also applications for which that is a no-go. Therefore, in [Part 6 - Wait a while](../6_wait_a_while/), we will introduce the technique of *long polling* which
solves this in a very elegant way.
