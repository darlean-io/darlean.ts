# Introduction

The `@darlean/core` package provides the functionality that is required to create an application that hosts Darlean actors.

# Installation

```
$ npm install @darlean/core
```

# Usage

## Standard usage

The standard usage of `@darlean/core` is as follows:
```ts
const builder = new ConfigRunnerBuilder();
builder.registerSuite( createYourSuite() );
const runner = builder.build();
await runner.run();
```

This creates a new [ConfigRunnerBuilder](https://docs.darlean.io/latest/ConfigRunnerBuilder.html) instance. A config-runner-builder is a class that builds an
[ActorRunner](https://docs.darlean.io/latest/ActorRunner.html#) from the configuration that is present as JSON/JSON5 file on disk, that is present as
command-line arguments and/or that is present via environment variables. Click [here](https://darlean.io/documentation/configuration-options/) for documentation 
about configuring Darlean and all the configuration options that are available.

The second line registers the actor suite(s) that contain the actors that should be hosted by the application.

The third line uses the configuration options and the registered suites to build an [ActorRunner](https://docs.darlean.io/latest/ActorRunner.html#) instance.

The last line actually starts the runner and waits until it is finished, which is when the application is killed, when the [run file is deleted](https://darlean.io/documentation/starting-and-stopping/)) 
or when application code calls `await runner.stop()`.

## Use as a client application

Client applications that may want to interact with Darlean actors may not want the runner to wait until the application is explicitly stopped. They may want the application to stop when their work is ready.

For that, replace the last line with the follwing block:

```ts
await runner.start();
try {
  // Do your work here
} finally {
  await runner.stop();
}
```

## Exhaustive example

The usage of `@darlean/core` is further illustrated by means of an [example](../examples/src/core) of a minimalistic but real, working distributed application.
