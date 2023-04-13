# Introduction

The `@darlean/base` package provides the types that are required to create and expose custom actor suites.

# Installation

```
$ npm install @darlean/base
```

# Actors, suites, packages and applications

## Actors

Actors play a key role in Darlean. Actors are objects that have state (often grouped together in one object to simplify persistence) and action methods.

Action methods are plain methods decorated with {@link @action} (or, for more advanced use cases, {@link @timer}, {@link @activator} or {@link @deactivator}).

Actors have a type (called 'actor type'), which is a string. It is recommended to use a dotted namespace notation to avoid name collisions, like `myorganization.MyActor`.

Actors can be `singular` and `multiplar`. A singular actor is guaranteed to only be active at most once at any moment within the entire cluster. A multiplar actor can
be active multiple times within the entire cluster.

## Suites

Related actors can be grouped together in a suite. So, a suite is just a collection of actor types that together provide one specific bit of functionality, like the
management of a shopping cart or a user administration.

A suite usually consists of a single creator function that receives configuration parameters as arguments, and then creates, fills in and returns an [IActorSuite](https://docs.darlean.io/latest/IActorSuite.html)
structure. This structure contains a list of actor definitions. Each definition contains the actor type, the kind (singular or multiplar) and an actor creator function.

The actor creator function is responsible for creating new actor instances. It is basically a factory function for actors.

Because the logic of creating actor instances is contained within the returned `IActorSuite`, it is not necessary to export the actors. Just exporting the suite creator function is
sufficient for other parts of the application to use your actors.

## Packages

When suites are to be used by other packages, they can be exported as a regular TypeScipt package. Unlike ordinary packages, where the actual functions and objects that
do the work are exported, for suite packages only the suite creator function needs to be exported. The reason is that the `IActorSuite` returned by the suite creator function
already knows how to instantiate new actor objects.

In addition to exporting the suite creator function, it is useful to also export the interfaces (usually `interface` types) and actor types (`string` types) of all actors that are
meant to be invoked remotely. These two pieces of information are sufficient for code to retrieve (discover) and invoke actors.

## Applications

When actors are created, grouped into suites and optionally packed into packages, it is necessary to instantiate an [ActorRunner](https://docs.darlean.io/latest/ActorRunner.html) to which
the suites can be registered. The actor runner takes care of the networking and other administration required to make actors discoverable by other applications and to handle action requests
to actors that it hosts (that is, that are part of suites that are registered to the runner).

The creation of such applications is *not* part of this library, because it would add a lot of dependencies to this base library that are not required for just writing actor suites.

To read more about creating Darlean applications that host registered actor suites, see the [@darlean/core](../core/) package.

# Usage

## Defining an actor

A simple actor with only one action method that just echoes back the received message can be created as follows:
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
        return `${this.name} echoes: ${value}`;
    }
}
```

Some remarks:
* For creating actors, we no not need `@darlean/core`. Just `@darlean/base` is sufficient for this simple case.
* The exported interface `IEchoActor` can be used by code that wants to invoke action methods on our actor without
  requiring a dependency on the implementing class (`EchoActor`). In our simple example this would not matter, because
  the class does not have external dependencies, but when the actor class would depend on a lot of external packages,
  it would be inconvenient and undesirable for code that wants to invoke the actor to also become dependent on these
  dependencies.
* The exported string `ECHO_ACTOR = 'demo.EchoActor'` makes it possible for code to retrieve (discover) the actor.

## Defining a suite

Based on the above actor, it is trivial to define the corresponding suite:
```ts
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

This creates a new actor suite with the definition of one actor (namely our echo actor), which is defined as a singular,
has `demo.EchoActor` as actor type, and has a creator function that derives the name of the actor by taking the first
element of the actor's id, and passing that to the constructor of `EchoActor`.

# See also
* Package [@darlean/core](../core/) which explains how to create Darlean applications that host exported actor suites
* A minimalistic [example application](../examples/src/core/) that uses the above mentioned echo actor.
* The [Darlean Tutorial](../examples/src/oracle/1_the_basics/) in which we illustrate step by step how to build a real distributed oracle that answers questions like 'How warm is it tomorrow?' and 'What is the price of milk?'.
* The [Darlean Documentation](https://darlean.io/documentation/) on our website.
* The [API Documentation](https://docs.darlean.io/latest/@darlean_base.html) for `@darlean/base`.