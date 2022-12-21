# Implementing actors

## A basic actor

Actors are in essence just regular objects that maintain a state and expose async actions:

``` ts
interface IThermostatState {
    temperature: number;
}

class ThermostatActor {
    protected state: IThermostatState;

    constructor(initialTemperature?: number) {
        this.state = {
            temperature: initialTemperature ? 16
        };
    }

    public async makeWarmer(amount: number): Promise<number> {
        this.state.temperature += amount;
        return this.temperature;
    }
}
```

Notes:
* By combining all state variables in a structure (like `IThermostatState` in this case), it becomes
easier to load and persist the entire state of the actor, as we will see later in this introduction.
* The initial temperature is simply passed as argument here, but in reality, it would make more sense
to load the actor's settings from a configuration file, and pass that entire structure to the constructor.

We can instantiate and use this actor like we always do with objects:

``` ts
const ta = new ThermostatActor(17);
const newRemperature = await ta.makeWarmer(1.5);
```

## A basic actor with persistence

The power of actors is that they are capable of persisting their state to persistent storage (like disk, a database
or cloud service). To do so, you have to pass them a [[IPersistence]] instance, and implement [activate](instances.IActivatable.activate)
and/or {@link instance.IDeactivatable.deactivate} methods:

``` ts
interface IThermostatState {
    temperature: number;
}

class ThermostatActor implements IActivatable, IDeactivatable {
    protected state: IThermostatState;

    constructor(persistence: IPersistence, initialTemperature?: number) {
        this.persistence = persistence;
        this.state = {
            temperature: initialTemperature ? 16
        };
    }

    public async activate(): Promise<void> {
        this.state = await this.persistence.load(['state']) ?? this.state;
    }

    public async makeWarmer(amount: number): Promise<number> {
        this.state.temperature += amount;
        return this.temperature;
    }

    public async deactivate(): Promise<void> {
        await this.persistence.store(['state'], this.state);
    }
}
```

To invoke this state-aware actor, we need an {@link IPersistence} instance, and be sure to
invoke `activate` and `deactivate` at the proper moments (later, we will see how we can do this
automatically).

For the sake of illustration, let's assume there exists a MemoryPersistence class which implements
`IPersistence` by simply storing items in a Map in memory.

``` ts
const ta = new ThermostatActor(new MemoryPersistence(), 17);
await ta.activate();
try {
    const newRemperature = await ta.makeWarmer(1.5);
} finally {
    await ta.deactivate();
}
```

## Actor wrappers

In the above examples, we have illustrated that it is possible to use actor objects like any other object.
That can be useful, for example, in simple unit tests that test only part of the actor functionality. However,
there are good reasons not to directly use actor objects in real applications:
* You would have to invoke `activate` and `deactivate` at the proper moments
* You would have to control manually which actors are alive and when they should be finalized (for example, to free
up memory that you need for other actors)
* Useful features like locking (the ability to limit concurrent invocation on certain actor methods) are
not available when directly invoking actors.
* The global lock (the property that of a given actor instance, no more than 1 instance is active in the entire
cluster) is bypassed.

To overcome these issues, it is recommended to use {@link instances.InstanceWrapper} together with {@link instances.InstanceContainer}.
The instance wrapper is like a proxy that wraps itself around an actor instance and provides locking and invokes the lifecycle methods
at the proper moments. The instance container manages the life cycle of actors (like automatically deactivating them when the container
capacity is reached).

``` ts
interface IThermostatActor {
    makeWarmer(amount: number): Promise<number>;
}

class ThermostatActor implements IThermostatActor, IActivatable, IDeactivatable {
    ...  same code as previous example
}
 
// Scenario 1: Via an instance container. The container takes care of life cycle management: it automatically creates 
// new actor instances when requested, and it automatically finalizes (deactivates) the least recently used actors
// when the container capacity is reached):
const container = new InstanceContainer<IThermostatActor>( (id) => new ThermostatActor(new MemoryPersistence(), 17), 100);
const ta1 = container.obtain(['livingroom']);
await ta1.makeWarmer(0.5);

// Scenario 2: Directly via an instance wrapper. The user code must create the actor instance and invoke
// the finalization (deactivate).
const ta2 = new ThermostatActor(new MemoryPersistence(), 17);
const wrapper = new InstanceWrapper(ta2);
try {
    const proxy = wrapper.getProxy();
    await proxy.makeWarmer(0.5);
} finally {
    await wrapper.deactivate();
}
```

Notes:
* When invoking actors, it is good practice to define a corresponding interface type (like `IThermostatActor`)
and then use the interface type wherever you can instead of the class name. The underlying reason is that
when moving actor implementations to other applications, you may not want to include the actual implementation code 
(the class) itself in your application for all kinds of reasons, but (re)defining the interface is usually no big issue.


# Actor containment

Hosting actors and making them accessible from the outside.

## InstanceFactory<T>
* Creates InstanceWrapper<T> around an Instance of type T

## InstanceWrapper<T>
* Proxies an Instance of type T
* Invokes activate and deactivate at the proper moments
* Provides the 'local locking' of methods

# Actor invocation

Invoking (remote) actions of actors from client code.

## Remote Portal
* `Retrieve(type, id)`: Provides a proxy that survives relocation of underlying actor
* The proxy implements backoff using a IBackOff instance
* The proxy performs retries and discovery
* The proxy provides methods for updating actual actor placement
* The proxy uses an `IRemote` to call actors (possible over the network)

## IRemote
* `invoke(options: IInvokeOptions): Promise<IInvokeResult>`: makes the call as specified in the options and returns the result.

## IInvokeOptions
* Have a destination (string) and content. Content typically is a IActorCallRequest.

## IInvokeResult
* Has an error code, error parameters and content. Content typically is a IActorCallResponse.

## IActorCallRequest
* Has actor type, actor id, action name and arguments.

## IActorCallResponse
* Has result or error of type IActorError.

```
InstanceFactory     InstanceWrapper   Instance
       --- produces ---->
                           --- uses -----> 

Actor code       IRemotePortal   IRemote
    --- has --------->                  
                      ----- has ---->          
```