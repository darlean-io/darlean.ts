# Distributed Oracle - Part 4 - Scale it up!

In the previous parts of this tutorial, we have created [a basic distributed oracle](../1_the_basics/), abstracted away the implementation by using [service actors](../2_oracle_as_a_service), and [added persistence](../3_do_not_forget/) so that actors can reincarnate on other nodes without loss of state. 

That means that we now have all ingredients to scale it up, and to move from a single all-in-one application that contained both client and server side code towards a truly distributed system with dedicated client and server applications.

## Scalability

The nice thing about actor oriented programming as we provide with Darlean is that scalability is already built in. The way we define virtual and service actors makes it possible to move from a single all-in-one scenario to a fully scalable multi-application scenario *without having to change our business logic*. Without having to change a single line of code in our actors, we can make the step towards a multiple-application deployment.

## So let's start

In this part of the tutorial, we move towards a client-server scenario.
* The **client** application is used to ask questions to the oracle
* The **server** application hosts the Darlean runtime and the oracle actors.

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

Our business logic that comes at the `...` is identical to part 3 of our tutorial. That is the nice property of actor oriented programming: business logic does not change when deployment changes.

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
    builder.registerSuite(oracle_suite(knowledge));
    const runner = builder.build();

    await runner.run();
}
```

Like the client, it creates a `ConfigRunnerBuilder`, but the server application also registers the oracle suite of actors. That means that the server application is capable of hosting our actors and of invoking actions on them.

The server is configured to be a *runtime node*. That is, it provides basic Darlean functionality that the cluster needs to operate, such as the distributed actor registry and actor lock, and persistence. Below, we will focus on this configuration.

## Configuration

To illustrate the flexibility of Darlean, we will show two kinds of configuration.
* For our setup with one client and one server, we illustrate the use of a single configuration file for both client and server application. This simplifies configuration a bit for small applications, but it also confuses because client applications have access to settings like the persistence configuration that are none of their business (only the server applications need this info in our example).
* For our setup with one client and 3 servers, we use a separate configuration file for the client, and a separate configuration file for the server. It requires an additional file, but is much cleaner because applications only have access to settings they really need.

### Single configuration file
The single configuration file for client and server in a cluster of 1 client and 1 server application is provided in [config.json5](../../../config/oracle/cluster1/config.json5):
```ts
{
    runtimeApps: ['server'],
    runtime: {
        persistence: {
            handlers: [{ compartment: 'fs.*', actorType: 'io.darlean.fspersistenceservice' }],
            specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],
            fs: {
                compartments: [
                    { compartment: '*', basePath: './persistence', shardCount: 1 },
                    { compartment: 'fs.oracle-fact', basePath: './persistence/oracle/fact' }
                ]
            }
        },
        nats: {
            enabled: true
        }
    },
    messaging: {
        providers: ['nats'],
        nats: {
            hosts: ['127.0.0.1']
        }
    }
}
```

The config starts with defining which applications form the 'runtime' (provide the distributed actor lock and registry and persistence). In our scenario, this is only the server application that we named "server" here.

Then comes the runtime configuration. This is only required for the server application, but because we illustrate here the use of a single config file for both client and server, we have to include it here. So, we provide the runtime settings, but we have not yet enabled the runtime itself (for the server application, we will reenable the runtime functionality by means of the `--darlean-runtime-enabled` command line argument).

The configuration of persistence is not different from the previous part of this tutorial. What is new, however, is that we instruct the server application to host the Nats server. Nats is the message bus that Darlean uses for communication between processes.

At the bottom, we configure the client and server application to actually use Nats. The `hosts` setting should have the same length as the `runtimeApps` settings, and must provide the hostname or IP address of the application.

We use command line arguments to pass the config file to the client and server application, and to override certain settings in [package.json](../../../package.json):
```
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster1/config.json5 --darlean-app-id server --darlean-runtime-enabled true
$ node lib/oracle/4_scale_it_up/client.js --darlean-config config/oracle/cluster1/config.json5 --darlean-app-id client    
```
So, for the server, we set the app-id to `server`, and enable the runtime to make it a runtime node. For the client, we set the app-id to `client`, and do not make it a runtime node.

*Note: in this example, we have chosen to combine our server nodes (that contain our own actors) with the runtime functionality. That is not required. It is also possible to define several (typically 3) dedicated runtime nodes, 2 or more server nodes, and then one or more client nodes. Which approach you take depends on availability requirements, how pure you are in conceptually having things right, and the amount of money you want to spend on hosting.*

### Separate configuration files

For the setup with one client and 3 servers, we will illustrate what configuration looks like when we split it up into two files: one for the client, and one for the server applications.

For the client application, the [client.json5](../../../config/oracle/cluster3/client.json5) looks like:
```ts
{
    runtimeApps: ['server01', 'server02', 'server03'],
    messaging: {
        providers: ['nats'],
        nats: {
            hosts: ['127.0.0.1', '127.0.0.1', '127.0.0.1']
        }
    }
}
```
Quite lean and mean, isn't it? It defines the applications that form the runtime (the 3 server applications, in this case). The clients needs to know this as a bootstrap in order to contact the distributed actor registry (which are actors itself) to find out on which node the other runtime actors are hosted in the cluster.

It also defines that Nats should be used for messaging, and for each of the runtime apps in the cluster, it defines the corresponding host name or IP address (in this case, localhost, `127.0.0.1`).

For the server, the configuration is in [server.json5](../../../config/oracle/cluster3/server.json5):
```ts
{
    runtimeApps: ['server01', 'server02', 'server03'],
    runtime: {
        enabled: true,
        persistence: {
            handlers: [{ compartment: 'fs.*', actorType: 'io.darlean.fspersistenceservice' }],
            specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],
            fs: {
                compartments: [
                    { compartment: '*', basePath: './persistence', shardCount: 1 },
                    { compartment: 'fs.oracle-fact', basePath: './persistence/oracle/fact' }
                ]
            }
        },
        nats: {
            enabled: true
        }
    },
    messaging: {
        providers: ['nats'],
        nats: {
            hosts: ['127.0.0.1', '127.0.0.1', '127.0.0.1']
        }
    }
}
```
The server configuration also defines the 3 runtime apps, but it also defines the runtime settings. In particular, the runtime functionality is already enabled (`runtime: { enabled: true }`), so we do not have to do that anymore on the command line. The other settings are similar to what we have already seen before.

To start the applications:
```
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-app-id server00
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-app-id server01
$ node lib/oracle/4_scale_it_up/server.js --darlean-config config/oracle/cluster3/server.json5 --darlean-app-id server02
$ node lib/oracle/4_scale_it_up/client.js --darlean-config config/oracle/cluster3/client.json5 --darlean-app-id client
```

Because we have separate configuration files for client and server, we just have to specify the correct configuration file and the proper app-id on the command line.

## That's all folks!
We can now run our distributed examples using the provided npm scripts:
* `$ npm run example:oracle:4:cluster1` - Deletes persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:4:cluster3:reuse` - Keeps persistence folder and runs the client and 1 server 
* `$ npm run example:oracle:4:cluster1` - Deletes persistence folder and runs the client and 3 servers 
* `$ npm run example:oracle:4:cluster3:reuse` - Keeps persistence folder and runs the client and 3 servers 

## What's next?

I can hear you thinking. Okay, we can deploy multiple applications. That's nice. We can run as many actors as we like, just by configuring more applications. Cool. But... Our `OracleActor`s are still a bottleneck! When the whole world comes to our oracle and starts asking questions about the very same topic, these questions all end up at the same actor instance, which runs on one process at a time, which at some moment will run out of CPU, memory or other resources?

In [Part 5 - Scalability continued](../5_scalability_continued/) we further analyze this situation, we will show why this is in practice not such a big issue. And for those situations in which it is an issue, we provide you with a nice solution.