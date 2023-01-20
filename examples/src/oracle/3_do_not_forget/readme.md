# Distributed Oracle - Part 3 - Do not forget

In [Part 2](../2_oracle_as_a_service) of this tutorial, we have refactored our initial very basic oracle to hide the implementation details behind a service (the `OracleService`). This additional layer of abstraction gives us the freedom to refactor our implementation when we have to later on, without effecting the application code that uses the oracle.

## Persistence
What is still missing is *persistence*. Persistence is the capability of an actor to store and load its internal state from and to persistent storage (like on disk, in a SQL or NOSQL database, or in a cloud database).

Persistence makes it possible for virtual actors to reincarnate: to come alive on a different node without loss of state.

Darlean provides the actors with properly configured persistence providers. Actors just have to optionally specify in which compartment they want to store their state, and darlean ensures that the data is properly stored (and later retrieved).

## Configuration

Before actors can use persistency, the cluster has to be configured to provide persistence. That is easily done in the [config-persistence.json5](../../../config/oracle/allinone/config-persistence.json5) configuration file:
```json
{
    runtime: {
        enabled: true,
        persistence: {
            // Mapping from compartment mask to which actor type implements the persistence service
            handlers: [{ compartment: 'fs.*', actorType: 'io.darlean.fspersistenceservice' }],

            // Mapping from specifiers (that are set in the suite configuration function) to compartment.
            specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],

            // Configuration of file-system persistence
            fs: {
                compartments: [
                    // Default settings for all compartments
                    { compartment: '*', basePath: './persistence', shardCount: 1 },
                    // Settings for the compartment where oracle facts are stored. We choose here
                    // to store them in a separate folder on disk.
                    { compartment: 'fs.oracle-fact', subPath: 'oracle/fact' }
                ]
            }
        },
    },
    messaging: {
        transports: []
    }
}
```
Persistence in Darlean uses the following concepts:
* A **specifier** is a string that actors provide to the framework. The specifier is a hint to the framework in which compartment the state should be persisted.
* A **compartment** is a part of a store. For example, when storing to a SQL database, every compartment could be its own table. Or when storing to file system, every compartment could be its own folder. It is good practice to group related data in the same compartment, and to put unrelated data in different compartments. That allows management tasks like cleaning up and backing up to be done for a certain part of the system without touching (and possibly breaking) other parts.
* Persistence is implemented via actors. A **handler** specifies which actor type is responsible for a certain compartment.

In the above configuration snippet, we can see that a specifier `oracle.fact.knowledge` (which is, as we will see
later, used by the `OracleActor`) is mapped to compartment `fs.oracle-fact`, and that this compartment is handled by an actor of type `io.darlean.fspersistenceservice` (which stands for File System Persistence Service). We also see that this same compartment is stored in `./persistence/oracle/fact`, and that only 1 shard is being used (for what it is worth at this moment).

To activate this configuration, we have to adjust the command line arguments in `package.json`:
```
"example:oracle:3": "npx rimraf ./persistence && node lib/oracle/3_do_not_forget/index.js --darlean-config config/oracle/allinone/config-persistence.json5",
```
## Implementation of the actor

Now that we have the configuration right, let's jump to the implementation.

Let's start with the `OracleActor` in [oracle.actor.ts](oracle.actor.ts).

To ensure that state is loaded when the actor becomes active, and stored when the actor becomes inactive, we add `IActivateable` and `IDeactivateable` to the class:
```ts
export class OracleActor implements IOracleActor, IActivatable, IDeactivatable {
```
We will implement them later.

Next, we change the type of the `knowledge` field to be an `IPersistable` of type `Knowledge`:
```ts
    protected knowledge: IPersistable<Knowledge>;
```
What whis means is that the `knowledge` field now has a `load` and `store` method, as well as a `value` field
(of type `Knowledge`) that contains the last set/loaded value.

We also change the constructor to receive an `IPersistence` instance, and to properly initialize the `knowledge`:
```ts
    constructor(persistence: IPersistence<Knowledge>, knowledge?: Knowledge) {
        this.knowledge = persistence.persistable(['knowledge'], undefined, knowledge ?? {});
    }
```
What it does is just to create a new `IPersistable` instance with the provided `knowledge` as value. It does *not* yet load the data from the underlying store (how could it? loading the data is an asynchronous operation, and we are in a synchronous constructor).

Now that we have the constructor right, we can implement the `IActivateable` and `IDeactivateable`:
```ts
    public async activate(): Promise<void> {
        await this.knowledge.load();
    }

    public async deactivate(): Promise<void> {
        await this.knowledge.store();
    }
```
We simply load the knowledge from the store on activation (when there is no knowledge yet in the store, the load is a noop -- the old value is still there), and store the knowledge on deactivation.

So far so good.

We still have to make a very small change in `ask` because we not have to use `this.knowledge.value` instead of just `this.knowledge`:
```ts
@action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge.value ?? {})) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }
```
and the same holds for `teach`, but here we also add an extra store whenever we are taught a new fact. The reason is that the `concurrently` script we use for running the examples does not support gentle stopping of processes on Windows (they are killed the hard way, so that the deactivation logic is not always invoked):
```ts
   @action()
    public async teach(fact: string, answer: number): Promise<void> {
        const knowledge = this.knowledge.value ?? {};
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        await this.knowledge.store();
    }
```

## The suite

And that's it! Our actor is ready to persist its state! We're ready now to jump to the suite function to properly inject the dependency on the `IPersistence` for the creator of the `OracleActor`:
```ts
       creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Lookup relevant facts for the topic in the knowledge
                const k = topic ? knowledge?.[topic] : undefined;
                // Create persistence interface. The specifier must match with the one of the `runtime.peristence.specifiers`
                // filters in the configuration file.
                const p = context.persistence<Knowledge>('oracle.fact.knowledge');
                // Create and return a new OracleActor instance with the provided persistence and knowledge
                return new OracleActor(p, k);
            }
```

What we do here is to ask our creation `context` for a new persistence interface of type `Knowledge` with 
`oracle.fact.knowledge` as specifier. As described before, darlean uses this specifier to determine in which
compartment the facts are to be stored. The additional mapping from specifier to compartment allows actors to only having to specify what they want to store in a functional way, without having to be dependent on or have knowledge of the specific persistence configuration of the system. 

## Running the example

The example can be run via
```
$ npm run example:oracle:3 -w examples
```

What this script does is
* First deleting the `./persistence` folder, so that the application starts with a clean environment
* Starting and running the application, which will teach a new fact and store that in the persistence folder.
* Checking that before the store, an `ask` for the yet unknown fact returns `42` (the equivalent of 'dont know'), and after the store, it returns the correct value.

## Reusing the stored data

To verify that the newly learned fact is actually stored, we can run the example again, but this time without first deleting the `./persistence` folder. We do that by means of the `:reuse` suffix to the command:
```
$ npm run example:oracle:3:reuse -w examples
```
The reuse flag instructs the code in [index.ts](index.ts) to already expect the correct value even before teaching it:
```ts
if (reuse) {
            check(
                99,
                await oracleService.ask('price', 'What is the price of an abracadabra?'),
                'The price of a previously learned product should be correct'
            );
        } else {
            check(
                42,
                await oracleService.ask('price', 'What is the price of an abracadabra?'),
                'The price of an unknown product should be 42'
            );
        }

        await oracleService.teach('price', 'abracadabra', 99);
```

## What's next?

We now know how to add persistence to our actors. So, basically we have finished our distributed oracle. But wait... Did I just say *distributed*? So far, we have only played around with one one all-in-one application right? Just about time to see whether we can turn things into a real client-server distributed applcation in [Part 4 - Scale it up!](../4_scale_it_up/). 