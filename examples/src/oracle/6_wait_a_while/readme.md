# Distributed Oracle - Part 6 - Wait a while!

In [Part 5](../5_follow_me/) of this tutorial, we introduced the multiple-follower pattern to achieve very high concurrency, especially when the same underlying virtual actor receives a lot of concurrent requests. There was one drawback: the followers fetch their state timer-based (in this case, every 10 seconds), which means that they are always quite some time behind the state of the controller actor.

## Long polling

In this part of the tutorial, we provide a solution by means of long-polling.

Long-polling? Isn't that prehistoric? Who uses long-polling nowadays?

Let's go one step back and explain briefly what long polling is. We will then explain why long-polling is a very good match for Darlean (as opposed to other environments like making http calls, for which long-polling is not really considered best practice).

Long polling is a mechanism where clients make a request and keep the connection open, and where the server responds immediately when it has new data, or keeps the connection open and waits for new data to arrive. When new data arrives, or a timeout expires, the server sends a response back, and the client starts a new request.

Why is long-polling not considered best practice for regular http requests? Because it is quite expensive to keep the connection open. Often, a new https connection is set up for every request, which is expensive. Also, browsers often have a maximum number of concurrent connections to a given host, which may lead to reduced performance of the web site when many such connections are being used for long polling. Lastly, there are nowadays better alternatives, such as websockets, to receive real-time data.

So, why do we suggest long-polling for Darlean? Because Darlean is different. To start, Darlean does not use separate https requests to invoke an action. In fact, it does not use http/https at all, but it uses persistent connections to Nats, a very high performance message bus. As a consequence, long-polling actions do not hold any networking resources open, and there is also no such concept like a maximum number of allowed connections, because there are no separate connections for separate actions.

There are basically 3 ways of receiving real-time data:
1. Polling at regular intervals. That is what we have implemented in [Part 5](../5_follow_me/), and has as drawback that it is not very responsive to changes.
2. Subscribing, and relying on the server to send you updates when something changes. The issue here is the hassle of managing the subscription. What if the actor
that provides the information (let's call it the serving actor) goes down or is unreachable? Or what if the client actor is unreachable or deactivated? How long should
a subscription last? What if a client did not receive any updates for x seconds, is that because there is no data, or because of an infrastructure issue? To detect such issues,
clients would have to ping the server at regular intervals (like every 10 seconds), which automatically brings us to the third solution:
3. Long polling. Long polling on the message bus level means: sending a request message to the serving actor, and waiting for the response message. So, 2 messages involved. When there
is no data, this means 2 messages every poll interval (like 10-20 seconds). When there is data, this means 2 messages for every time there is data. Regarding number of messages, this
is identical to the other 2 scenarios: polling at regular intervals also has 2 messages every poll interval (but does, of course, not have the intermediate messages when there is new
data), and the subscription mechanism also involves 2 message (unless you want to rely on fire-and-forget).

So, because Darlean does not depend on per-request connections, but uses persistent connections to a high performance message bus, long polling is a very elegant solution that eliminates
the hassle of regular interval polling and the subscription model. By keeping the maximum long-poll timeout reasonably short (like 10-20 seconds), client actors get quick feedback when
there are infrastructure issues, which keeps them responsive.

## The mechanism

So, how does our long-poll work for the distributed oracle? During activation, the controller fetches its state from the persistence, and creates a new, random string (we call that the `nonce`).
We use UUID's for this. Whenever our state changes (because of calls to `teach`), we generate a new nonce and store it in our memory (there is no need to persist the nonce, it is sufficient to
generate a random new nonce the next time we activate).

Follower actors perform a long-poll on the controller actor. They provide the nonce for which they already have information (or an empty string when they do not yet have any information). The controller
compares this nonce with its own nonce.
* When they are identical, the client already has the most recent data, and the server starts to sleep until it has new data. When it has new data, it returns the new data (including the corresponding nonce). When it has no new data after a configured timeout, it responds with the current data (and corresponding nonce).
* When they are different, the client needs new data, so the server does *not* sleep, but immediately responds with the latest data (including the corresponding nonce).

## Refactor, refactor, refactor

In the [previous part](../5_follow_me/), we already shared the observation that our actor code had become a bit messy, because it basically combined two responsiblities in one class: being a controller (that only writes data and accesses persistence), and being a follower (that only reads data and accesses a controller). So, let's take the time to refactor and to make separate `OracleControllerActor` and `OracleFollowerActor` classes.

> Note: Our introduction of the *service actor* that we did in [Part 2 - Oracle as a Service](../2_oracle_as_a_service/) now allows us to massively refactor our implementation, and as we will show, without having impact on the client side that invokes our oracle! Three times hooray for having separated implementation and interface by means of service actors!

## The controller actor

The controller actor now is in [oracle.actor.controller.ts](oracle.actor.controller.ts), and looks as follows:
```ts
export class OracleControllerActor implements OracleControllerActor, IActivatable, IDeactivatable {
    protected knowledge: IPersistable<Knowledge>;
    protected nonce = '';
    protected pollController: PollController<boolean>;

    constructor(persistence: IPersistence<Knowledge>, knowledge?: Knowledge) {
        this.knowledge = persistence.persistable(['knowledge'], undefined, knowledge ?? {});
        this.pollController = new PollController();
    }

    public async activate(): Promise<void> {
        await this.knowledge.load();
        this.nonce = uuid.v4();
    }

    public async deactivate(): Promise<void> {
        await this.knowledge.store();
        this.pollController.interrupt(false);
        this.pollController.finalize();
    }

    @action({ locking: 'exclusive' })
    public async teach(fact: string, answer: number): Promise<void> {
        const knowledge = this.knowledge.value ?? {};
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        this.nonce = uuid.v4();
        this.pollController.interrupt(true);
        await this.knowledge.store();
    }

    @action({ locking: 'none' })
    public async fetch(nonce: string): Promise<{ nonce: string; knowledge: Knowledge }> {
        if (nonce === this.nonce) {
            await this.pollController?.wait(10 * 1000);
        }

        return {
            nonce: this.nonce,
            knowledge: this.knowledge.value ?? {}
        };
    }
}
```
What we see is:
* The constructor creates a new [PollController](https://docs.darlean.io/latest/PollController.html), which is available in package [@darlean/utils](https://docs.darlean.io/latest/@darlean_utils.html). That
is a component that can be [interrupted](https://docs.darlean.io/latest/PollController.html#interrupt) when there is new data, and on which applications can [wait](https://docs.darlean.io/latest/PollController.html#wait)
until the component is interrupted or a timeout expires.
* During `activate`, the controller loads it data from persistence, and also generates its initial nonce.
* During `deactivate`, the knowledge is persisted, the pollcontroller interrupted (to ensure that the actor stops swiftly without first finishing all open poll actions), and finalizes the poll controller.
* During `teach`, besides updating the internal knowledge, a new nonce is generated and the poll controller is interrupted so that open poll actions will abort and return the new data to the client.
* During `fetch`, the follower nonce and the controller nonce are compared. When they are identical, the controller waits for new data. Otherwise, or when there is no new data, the controller returns its current state.

## Action locking

We have decorated `teach` and `fetch` with action locking instructions (`exclusive` and `none`, respectively). Without these instructions, we would have an issue during deactivation. Because deactivation
requires (by default) an *exclusive* lock, the implementation of `deactivate` would only be invoked when all other methods are finished. Because we use long-polling, and multiple followers are polling, there will
never be a situation in which all action methods are finished. (Even when there were such a moment, it could take minutes before that occurs, and that makes our shutdown cycle very inconvenient).

We solve this by setting the locking for the long-polling `fetch` action to `none`. That means that no locking is applied at all: fetch can be invoked (and running) at any moment, even parallel with the `deactivate`
code. Our implementation is performed in such a way that this causes no issues: the `deactivate` first stores our knowledge (no problem there), and then interrupts the poll controller. At that moment, the pending
`fetch` calls continue and return the current knowledge and nonce (that are both still assigned, because the object is still in memory).

The `teach` action is marked as `exclusive`, which means that only one teach at a time is allowed to run. When multiple simultaneous calls to `teach` are made, the subsequent ones stay in an internal queue until the
previous call is finished. When this takes too long, Darlean throws a timeout in the client code.

## The follower actor

The code for the follower actor is in [oracle.actor.follower.ts](oracle.actor.follower.ts), and is as follows:

```ts
export class OracleFollowerActor implements IOracleFollowerActor, IActivatable, IDeactivatable {
    protected knowledge: Knowledge;
    protected controller: IOracleControllerActor & IAbortable;
    protected pollTimer: IVolatileTimer;
    protected pollHandle?: IVolatileTimerHandle;
    protected pollAborter?: Aborter;
    protected nonce = '';

    constructor(controller: IOracleControllerActor & IAbortable, pollTimer: IVolatileTimer) {
        this.knowledge = {};
        this.controller = controller;
        this.pollTimer = pollTimer;
    }

    public async activate(): Promise<void> {
        const result = await this.controller.fetch('');
        this.knowledge = result.knowledge;
        this.nonce = result.nonce;
        this.pollHandle = this.pollTimer.repeat(this.refetch, 0, 0);
    }

    public async deactivate(): Promise<void> {
        this.pollAborter?.abort();
    }

    @action({ locking: 'shared' })
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge)) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @timer({ locking: 'none' })
    public async refetch(): Promise<void> {
        try {
            const aborter = new Aborter();
            this.pollAborter = aborter;
            this.controller.aborter(aborter);
            const result = await this.controller.fetch(this.nonce);
            this.knowledge = result.knowledge;
            this.nonce = result.nonce;
        } catch (e) {
            // When an error occurs, do not resume immediately. It could be that the
            // error occurs immediately, and that would effectively cause full CPU load
            // which is what we want to avoid.
            this.pollHandle?.pause(1000);
        }
    }
}
```
What we see is:
* A link to a controller. The controller is not optional anymore, because we are now a dedicated follower, and every follower has a controller.
* The controller implements IAbortable, which provides the actor with a mechanism to abort long-running polling operations. As we will see later,
this is required when the actor wants to deactivate.
* A poll timer. This is an object the actor can use to schedule the actual polling timer.
* A poll handle, which is the actual scheduled polling timer. The handle can be used to cancel the timer.
* A poll aborter, which can be used to abort the current polling operation.
* The latest received nonce.

The `activate` fetches the latest knowledge from the controller. It provides an empty string as nonce, which is always different from the
randomly generated nonce of the controller, so that the controller will immediately respond (without waiting) with the most recent knowledge. Then,
the nonce and knowledge are stored, and the poll timer is started.

> Note: The poll timer *immediately* invokes the `refetch` timer method when the previous invocation is finished (repeat interval = 0). That provides
a continuous loop of polling. The timer is automatically stopped by the framework when the actor is deactivated. As a safety measure against ending
up in an infinite loop with 100% CPU usage when something goes wrong inside of `refetch` and the long-polling returns immediately, we catch exceptions
there and pause the timer for 1 second.

The `deactivate` aborts the current polling operation. Note that `refetch` (a long-running operation) has `locking: 'none'` configured, so that it
does not stop the `deactivate` from being invoked.

The `ask` is no different from our previous version. It just tries to find the answer in the knowledge as it is currently known.

The `refetch` starts with the creation of a new [Aborter](https://docs.darlean.io/latest/Aborter.html) instance and assigns it to `this.pollAborter`. An
aborter is an object on which application code can call the [abort](https://docs.darlean.io/latest/Aborter.html#abort) method, which instructs the long-running
operation to abort itself. By invoking `this.controller.aborter(aborter)`, the aborter object is paired with `this.controller`, so that it is used for the
very next action call to the controller (which is the line below: `await this.controller.fetch(this.nonce)`).

Because of the aborter, the `deactivate` can abort a long-running pool operation, so that the deactivation becomes swift.

When an error occurs, it is silently absorbed (not rethrown -- it would be better to have it logged), and the poll timer is paused for 1 second
to prevent an infinite loop with 100% CPU usage when infrastructure errors occur that return immediately instead of after the poll interval.

## The service actor

Because of our refactoring, we also have to adjust the service actor in [oracle.service.ts](oracle.service.ts):
```ts
// Implementation of the service that hides the implementation (OracleActor) from the user.
export class OracleService implements IOracleService {
    protected controlPortal: ITypedPortal<IOracleControllerActor>;
    protected followerPortal: ITypedPortal<IOracleFollowerActor>;

    constructor(controlPortal: ITypedPortal<IOracleControllerActor>, followerPortal: ITypedPortal<IOracleFollowerActor>) {
        this.controlPortal = controlPortal;
        this.followerPortal = followerPortal;
    }

    @action({locking: 'shared'})
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to a random follower OracleActor for the specific topic
        const actor = this.followerPortal.retrieve([topic, Math.floor(Math.random() * NR_FOLLOWERS).toString()]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action({locking: 'shared'})
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the controller OracleActor for the specific topic
        const actor = this.controlPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
```

We now have 2 portals: one to obtain controllers (with interface `IOracleControllerActor`), and one to obtain followers (with interface `IOracleFollowerActor`).

In the `ask`, we use the follower portal to handle the request. In the `teach`, we use the control portal.

# Running

Now we can run the examples:
* `$ npm run example:oracle:6:cluster3` - Deletes persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:6:cluster3:reuse` - Keeps persistence folder and runs the client and 1 server

The output should be the same as for the [previous part](../5_follow_me/) of this tutorial.

## What's next?

So what's next? We have showed you how to [create a basic actor](../1_the_basics/), how to add a [service actor](../2_oracle_as_a_service/) and [persistence](../3_do_not_forget/).
We [scaled it up](../4_scale_it_up/), introduced the [follower-pattern](../5_follow_me/) and now even optimized scalability to the max using the powerful concept of [long-polling](../6_wait_a_while/)!

Congratulations! You have now seen all the most important concepts and techniques of Darlean. You should now understand the power the actor-oriented programming offers. It
overcomes the [microservice premium](https://martinfowler.com/bliki/MicroservicePremium.html) and allows you to program highly distributable application with the same ease
as programming plain old traditional monoliths.

Well done & Happy Darleaning!