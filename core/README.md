# Introduction

The `@darlean/core` package provides the functionality that is required to create an application that hosts Darlean actors.

* For information on how to create actors and actor suites, see the @darlean/base package ([GitLab](https://gitlab.com/darlean/javascript/repo/-/tree/main/base)|[NPM](https://www.npmjs.com/package/@darlean/base)).

# Installation

```
$ npm install @darlean/core
```

# Usage

## Use as a server application

The standard usage of `@darlean/core` as a server application is as follows:
```ts
const builder = new ConfigRunnerBuilder();
builder.registerSuite( createYourSuite() );
const runner = builder.build();
await runner.run();
```

The first line creates a new [ConfigRunnerBuilder](https://docs.darlean.io/latest/ConfigRunnerBuilder.html) instance. A config-runner-builder is a class that builds an
[ActorRunner](https://docs.darlean.io/latest/ActorRunner.html#) from the configuration that is present as JSON/JSON5 file on disk, that is present as
command-line arguments and/or that is present via environment variables. Click [here](https://darlean.io/documentation/configuration-options/) for documentation 
about configuring Darlean and all the configuration options that are available.

The second line registers the actor suite(s) that contain the actors that should be hosted by the application. This can be custom-made actor suites that contain
project-specific functionality, or it can be standard (out-of-the-box) actor suites provided by Darlean or other parties (including the @darlean/runtime-suite ([GitLab](https://gitlab.com/darlean/javascript/repo/-/tree/main/suites/runtime-suite)|[NPM](https://www.npmjs.com/package/@darlean/runtime-suite)))
which is a bundle that contains a minimal set of suites that together provide runtime functionality).

The third line uses the configuration options and the registered suites to build an [ActorRunner](https://docs.darlean.io/latest/ActorRunner.html#) instance.

The last line actually starts the runner and waits until it is finished, which is when the application is killed, when the [run file is deleted](https://darlean.io/documentation/starting-and-stopping/) 
or when application code calls `await runner.stop()`.

## Use as a client application

Client applications that may want to interact with Darlean actors may not want the runner to wait until the client application is explicitly stopped. They may want the application to stop immediately when their work is ready.

For that, replace the last line  `await runner.run()` with the follwing block:

```ts
await runner.start();
try {
  // Do your work here
} finally {
  await runner.stop();
}
```

## Access to actors

A client application can get access to remote actors (and invoke action methods on them) by means of an [IPortal](https://docs.darlean.io/latest/IPortal.html#) that can be obtained via [ActorRunner.getPortal()](https://docs.darlean.io/latest/ActorRunner.html#getPortal):

```ts
const actor = runner.getPortal().retrieve<IActorType>('ActorType', ['the', 'id', 'of', 'the', 'actor']);
const result = await actor.doSomething(arg1, arg2);
```

In this snippet, `actor` is a proxy (stub) with interface `IActorType`. In this snippet, we assume that `IActorType` has a method `doSomething(arg1, arg2)`, which is
why the second like works. The `retrieve` expects the actor type (in this example: `'ActorType'`), and the Id (which is a `string[]`).

## Typed actors

When application code needs access to multiple actors of the same type, it is recommended to use an [ITypedPortal](https://docs.darlean.io/latest/ITypedPortal.html#):

```ts
const typedPortal = runner.getPortal().typed<IActorType>('ActorType');
const oneActor = typedPortal.retrieve(['id1']);
const anotherActor = typedPortal.retrieve(['id2']);
```

## Elaborative example

The usage of `@darlean/core` is further illustrated by means of an [elaborative example](https://gitlab.com/darlean/javascript/repo/-/tree/main/examples/src/core) of a minimalistic but real, working distributed application.

# Configuration

Darlean apps can be configured by means of JSON/JSON5 files, command-line arguments and environment variables.

More information about how to configure Darlean can be found [here](https://darlean.io/documentation/configuration-options/).

# See also
* Package @darlean/base ([GitLab](https://gitlab.com/darlean/javascript/repo/-/tree/main/base)|[NPM](https://www.npmjs.com/package/@darlean/base)) which explains how to create actors and actor suites
* A minimalistic [example application](https://gitlab.com/darlean/javascript/repo/-/tree/main/examples/src/core/) that uses the above mentioned echo actor.
* The [Darlean Tutorial](https://gitlab.com/darlean/javascript/repo/-/tree/main/examples/src/oracle/1_the_basics/) in which we illustrate step by step how to build a real distributed oracle that answers questions like 'How warm is it tomorrow?' and 'What is the price of milk?'.
* The [Darlean Documentation](https://darlean.io/documentation/) on our website.
* The [API Documentation](https://docs.darlean.io/latest/@darlean_core.html) for `@darlean/core`.