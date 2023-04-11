# Distributed Oracle - Part 4 - Scale it up!

In the previous parts of this tutorial, we have created [a basic distributed oracle](../1_the_basics/), abstracted away the implementation by using [service actors](../2_oracle_as_a_service), and [added persistence](../3_do_not_forget/) so that actors can reincarnate on other nodes without loss of state. 

That means that we now have all ingredients to scale it up, and to move from a single all-in-one application that contained both client and server side code towards a truly distributed system with dedicated client and server applications.

## Scalability

The nice thing about actor oriented programming as we provide with Darlean is that scalability is already built in. The way we define virtual and service actors makes it possible to move from a single all-in-one scenario to a fully scalable multi-application scenario *without having to change our business logic*.

> Without having to change a single line of code in our actors, we can move from a single-process application towards a multiple-application deployment. We just nailed the [microservice premium](https://martinfowler.com/bliki/MicroservicePremium.html). How cool is that!

## So let's start

In this part of the tutorial, we move towards a client-server scenario.
* The **client** application is used to ask questions to the oracle
* The **server** application hosts the Darlean runtime and the oracle actors.

> Note: For this relatively simple application, we have decided to combine our own actors with the Darlean runtime functionality in one application. Depending on our need for availability, on how pure we are when it comes to having our concepts right, and on the amount of money we want to spend on hosting, it would also be possible to create and deploy a set of dedicated runtime applications (that contain just the runtime) *and* a set of dedicated application applications (that contain just our own actors). Advantage of the latter scenario is that it is easier to scale up our oracle actors without having to redeploy the runtime applications. The downside is complexity and cost.

Depending on our configuration, we can then run one client with one server, or run one client with multiple server applications. We will come to that later.

Let's start by splitting up our single [index.ts](index.ts) into a [client.ts](client.ts) and a [server.ts](server.ts). These become the entry points for the client and server application, respectively, that you pass to `node` as argument.

## The client

The `main` function in [client.ts](client.ts) starts with creation and configuration of the actor runner:
```ts
    const builder = new ConfigRunnerBuilder();
    const runner = builder.build();
```

The `ConfigRunnerBuilder` is a class that creates a fully configured actor runner based on a configuration file provided as `--darlean-config` command-line argument. Other command-line arguments starting with `--darlean-` can override or supplement the settings in the configuration file, as well as environment variables starting with `DARLEAN_`. More information is in the [documentation](http://docs.darlean.io/latest/ConfigRunnerBuilder.html).

Now that we have the runner, we can start it:
```ts
    await runner.start();
    try {
        await sleep(10 * 1000);

        ...
    } finally {
        await runner.stop();
    }
}
```

This code starts the runner and sleeps for a short while to give all applications the time to start running. Our business logic comes at the `...`, and when we are done, we stop the runner.

Our business logic at the `...` is identical to part 3 of our tutorial. That is the nice property of actor oriented programming: business logic does not change when deployment changes.

```ts
const oraclePortal = runner.getPortal().typed<IOracleService>(ORACLE_SERVICE);
const oracleService = oraclePortal.retrieve([]);

check(
    20,
    await oracleService.ask('temperature', 'What is the temperature of today?'),
    "Today's temperature should be ok"
);        
```
It would be nicer to move the business logic to a separate file, instead of having in our entry point script, but we will leave that as an excercise to the reader.

One thing to note is that this client application has *no* references to the implementation of the oracle actors. It only uses the `IOracleService` *interface*, but it has no knowledge of the implementation of this interface nor does it host the actors. That is all performed by the server applications.

## The server

The implementation of `main` for [server.ts](server.ts) is so simple that we give it here in one single snippet:
```ts
async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    builder.registerSuite(createOracleSuite(knowledge));
    const runner = builder.build();

    await runner.run();
}
```

Like the client, it creates a `ConfigRunnerBuilder`, but the server application also registers the oracle suite of actors. That means that the server application is capable of hosting our actors and of invoking actions on them.

The server is configured to be a *runtime node*. That is, it provides basic Darlean functionality that the cluster needs to operate, such as the distributed actor registry and actor lock, and persistence. 
The line with `createRuntimeSuiteFromBuilder` takes care of this: It registers all these special actors that are required to run Darlean applications. Below, we will focus on this configuration.

## Shared locking

When we told you that we did not have to make any code change in your business logic -- we were lying. There is one very small changes we need to make. We should already had done that before, but we did not want
to bother you with that at that moment. Because of the defensive nature of Darlean, the default action locking
is set to `exclusive` (the strictest value), *even for service actors* that normally are multiplar. To take advantage of our scalability, it is important to change the locking of the `ask` and `teach` of the `OracleService` actor to
`shared`:
```ts
    @action({locking: 'shared'})
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action({locking: 'shared'})
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
```
By doing so, multiple parallel calls to `ask` and `teach` are allowed, so even when the actors are slow, the service layer is no bottleneck and just invokes multiple actors at the same time in parallel. This
has no impact on the safety of our data, because the service actor itself does *not* store any data. It is the underlying *virtual actor* that controls the data, and for which the locking should be set properly.

> Note: We could also make an optimization to the underlying virtual actor (`OracleActor`). In theory, we could have implemented it in such a way that the read-calls to `ask` could all be invoked in parallel, under
the assertion that the underlying data is not changed meanwhile. We could than change the locking of `ask` to `shared`. But, in this case, it does not matter because the implementation of `ask` does not contain any awaits. As a
result, it is one synchronous block of code, and the way javascript works (with only one main thread) already means that no 2 calls to `ask` will ever be performed in parallel. That just is not possible. So we have nothing to
gain here. In fact, it will only cause us trouble when we refactor our code in parts [5](../5_follow_me/) and [6](../6_wait_a_while/) and change how we receive new knowledge.

## Different ways of configuration

To illustrate the flexibility of Darlean, we will show two kinds of configuration.
* For our setup with one client and one server, we illustrate the use of a single configuration file for both client and server application. This simplifies configuration a bit for small applications, but it also confuses because client applications have access to settings like the persistence configuration that are none of their business (only the server applications need this info in our example).
* For our setup with one client and 3 servers, we use a separate configuration file for the client, and a separate configuration file for the server. It requires an additional file, but is much cleaner because applications only have access to settings they really need.

### Approach 1: Single configuration file
The single configuration file for client and server in a cluster of 1 client and 1 server application is provided in [config.json5](../../../config/oracle/cluster1/config.json5):
```ts
{
    runtimeApps: ['server'],
    runtime: {
        persistence: {
            specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],
            fs: {
                compartments: [
                    { compartment: '*', basePath: './persistence', shardCount: 1 },
                    { compartment: 'fs.oracle-fact', basePath: './persistence/oracle/fact' }
                ]
            }
        },
    }
}


```

The config starts with defining which applications form the 'runtime' (provide the distributed actor lock and registry and persistence). In our scenario, this is only the server application that we named "server" here.

Then comes the runtime configuration. This is only required for the server application, but because we illustrate here the use of a single config file for both client and server, we have to include it here. The runtime functionality will
by default only be enabled when the application id is in the list of provided `runtimeApps`. Because we only run the service application with appid `server`, the runtime functionality is automatically enabled for the server application,
and disabled for the client application.

The configuration of persistence is not different from the previous part of this tutorial.

We use command line arguments to pass the config file to the client and server application, and to override certain settings in [package.json](../../../package.json):
```
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster1/config.json5 --darlean-appid server
$ node lib/oracle/4_scale_it_up/client.js --darlean-config config/oracle/cluster1/config.json5 --darlean-appid client    
```
So, for the server, we set the app-id to `server`. For the client, we set the app-id to `client`.

### Approach 2: Separate configuration files

For the setup with one client and 3 servers, we will illustrate what configuration looks like when we split it up into two files: one for the client, and one for the server applications.

For the client application, the [client.json5](../../../config/oracle/cluster3/client.json5) looks like:
```ts
{
    runtimeApps: ['server01', 'server02', 'server03'],
    messaging: {
        dmb: {
            hosts: ['127.0.0.1', '127.0.0.1', '127.0.0.1']
        }
    }
}
```
Quite lean and mean, isn't it? It defines the applications that form the runtime (the 3 server applications, in this case). The clients needs to know this as a bootstrap in order to contact the distributed actor registry (which are actors itself) to find out on which node the other runtime actors are hosted in the cluster.

It also defines the host names / IP addresses for each of the runtime apps in the cluster. In this case, we use localhost (`127.0.0.1`) because all processes are running on the same machine.

> Note: `dmb` stands for Darlean Message Bus. It is a message bus that Darlean provides out-of-the-box. Internally, it uses NATS, which a very simple but powerful message bus.

For the server, the configuration is in [server.json5](../../../config/oracle/cluster3/server.json5):
```ts
{
    runtimeApps: ['server01', 'server02', 'server03'],
    runtime: {
        persistence: {
            specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],
            fs: {
                compartments: [
                    { compartment: '*', basePath: './persistence', shardCount: 1 },
                    { compartment: 'fs.oracle-fact', basePath: './persistence/oracle/fact' }
                ]
            }
        }
    }
}
```
The server configuration also defines the 3 runtime apps, but it also defines the runtime settings.

We have chosen here to omit the `messaging.dmb.hosts` setting, which is allowed because Darlean assumes localhost (`127.0.0.1`) by default.

To start the applications:
```
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-appid=server00
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-appid=server01
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-appid=server02
$ node lib/oracle/4_scale_it_up/client.js --darlean-config config/oracle/cluster3/client.json5 --darlean-appid=client
```

Because we have separate configuration files for client and server, we just have to specify the correct configuration file and the proper app-id on the command line.

### Approach 3: No configuration at all

When we do not care about where our oracle-specific data is stored on disk, we can even run without any configuration files at all!

```
$ node lib/oracle/4_scale_it_up/server.js --darlean-runtimeapps=server01,server02,server03 --darlean-appid=server00
$ node lib/oracle/4_scale_it_up/server.js --darlean-runtimeapps=server01,server02,server03 --darlean-appid=server01
$ node lib/oracle/4_scale_it_up/server.js --darlean-runtimeapps=server01,server02,server03 --darlean-appid=server02
$ node lib/oracle/4_scale_it_up/client.js --darlean-runtimeapps=server01,server02,server03 --darlean-appid=client
```

Or by a combination of environment variables and command line arguments:
```
$ export DARLEAN_RUNTIMEAPPS=server01,server02,server03
$ node lib/oracle/4_scale_it_up/server.js --darlean-appid=server00
$ node lib/oracle/4_scale_it_up/server.js --darlean-appid=server01
$ node lib/oracle/4_scale_it_up/server.js --darlean-appid=server02
$ node lib/oracle/4_scale_it_up/client.js --darlean-appid=client
```


## That's all folks!
We can now run our distributed examples using the provided npm scripts:
* `$ npm run example:oracle:4:cluster1` - Deletes persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:4:cluster1:reuse` - Keeps persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:4:cluster3` - Deletes persistence folder and runs the client and 3 servers 
* `$ npm run example:oracle:4:cluster3:reuse` - Keeps persistence folder and runs the client and 3 servers 

## What's next?

I can hear you thinking. Okay, we can deploy multiple applications. That's nice. We can run as many actors as we like, just by configuring more applications. Cool. But... Our `OracleActor`s are still a bottleneck! When the whole world comes to our oracle and starts asking questions about the very same topic, these questions all end up at the same actor instance, which runs on one process at a time, which at some moment will run out of CPU, memory or other resources?

In [Part 5 - Follow me](../5_follow_me/) we further analyze this situation, we will show why this is in practice not such a big issue. And for those situations in which it is an issue, we provide you with a chilling solution.