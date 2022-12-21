/**
 * Provides Darlean core functionality for defining, exposing and invoking local or remote actors.
 * 
 * ## Overview
 * 
 * Actors are **objects with public asynchronous methods** that are decorated with the special {@link experiment!action | @action}, 
 * decorator that makes Darlean understand that it is an action method that should be exposed to other actors for
 * remote invocation (instead of just a regular method that can only be invoked directly on the actor instance itself, and
 * that should not exposed for remote invocation for safety reasons).
 * 
 * Actors can choose to implement the {@link IActivatable.activate} and/or {@link IDeactivatable.deactivate} methods
 * which are automatically invoked just before actions are invoked on a newly created instance, and just after an existing
 * already activated instance is finalized, respectively. The conditions for finalizing depend on the chosen imlementation for
 * {@link experiment!IInstanceContainer}, which manages the instances of a particular actor type. The default implementation,
 * {@link experiment!InstanceContainer}, maintains a least-recently-used administration from which the oldest items are removed
 * when the number of actor instances in the container exceeds a predefined capacity threshold.
 * 
 * ```ts
 * // Interface:
 * 
 * // It is good practice not to declare just the actor implementation, but also an
 * // interface for invoking the actor without introducing dependencies to the implementation.
 * // This can (and should) be done in a different file than where the implementation resides.
 * interface IThermostatActor {
 *     makeWarmer(amount: number): Promise<number>;
 *     getTemperature(): Promise<number>;
 * }
```

```ts 
 * // Implementation:
 * 
 * // It is useful to combine all state fields into a structure to ease persistence of all data.
 * interface IThermostatState {
 *     temperature: number;
 * }
 *
 * // The actual actor implementation. Should be decorated with @actor (for virtual actors) or
 * // with @service (for service actors).
 * @actor()
 * class ThermostatActor implements IThermostatActor, IActivatable, IDeactivatable {
 *     protected state: IThermostatState;
 * 
 *     constructor(persistence: IPersistence, initialTemperature?: number) {
 *         this.persistence = persistence;
 *         this.state = {
 *             temperature: initialTemperature ? 16
 *         };
 *     }
 *
 *     public async activate(): Promise<void> {
 *         this.state = await this.persistence.load(['state']) ?? this.state;
 *     }
 *
 *     // Actions must be decorated to differ from regular methods
 *     @action()    
 *     public async makeWarmer(amount: number): Promise<number> {
 *         this.state.temperature += amount;
 *         return this.temperature;
 *     }
 * 
 *     // Decorator arguments set specific behaviour of actions
 *     @action({ locking='shared' })
 *     public async getTemperature(): Promise<number> {
 *         return this.temperature;
 *     }
 * 
 *     public async deactivate(): Promise<void> {
 *         await this.persistence.store(['state'], this.state);
 *     }
 * }
 * ```
 * 
 * Internally, Darlean wraps every actor instance in an {@link experiment!InstanceWrapper}, which takes care of global actor
 * uniqueness (a given actor is guaranteed to only exists at most once within the entire cluster) and action locking. Both can
 * be enabled/disabled and configured via the {@link experiment!actor | @actor}/{@link experiment!service | @service} and {@link experiment!action | @action}
 * decorators, respectively.
 * 
 * Any exceptions thrown within action methods are caught, converted into an {@link experiment!ActorError}, and propagated to the
 * (local or remote) caller.
 * 
 * Actors **can be invoked from other (remote) actors** by passing the invoking actor an {@link experiment!IPortal} instance, which it can
 * use to create proxy objects to the remote actor. It can use those proxy objects as if it were local objects:
 * 
 * ```ts
 * const actor = portal.retrieve<IMyActor>('MyActor', ['123']);
 * await actor.doSomething('a', 345);
 * ```
 * 
 * When the type of the actor is already known, an {@link experiment!ITypedPortal} can be used as well. This simplifies
 * the code that invokes the actor and removes dependencies there on the actor type:
 * ```ts
 * const myActorPortal = new TypedPortal<IMyActor>(portal, 'MyActor');
 * ...
 * const actor = myActorPortal.retrieve(['123']);
 * await actor.doSomething('a', 345);
 * ```
 * 
 * Other portal implementations are {@link experiment!RemotePortal} for a portal that connects to remote actors via 
 * {@link experiment!IRemote}/{@link infra!ITransport} instances; and {@link experiment!LocalPortal} for a simplified version
 * of the remote portal that only exposes actors hosted within the same process as the code that invokes the actors. The latter is useful
 * for small, single-process applications that can later, when they grow, easily be split over multiple processes by simply replacing the
 * local portal with a remote portal.
 * 
 * ## Types for managing and invoking local actors
 * 
 * The following abstractions and implementations provide functionality to manage the life cycle of, and to invoke local actors (that is, 
 * actors that run within the current process):
 * 
 * * {@link experiment!IInstanceContainer} - Abstraction of an **actor instance container** that creates and finalizes new 
 *    actor instances and provides additional functionality such as locking (on actor and action level) and automatic
 *    invocation of the activation/deactivation handlers.
 *   * {@link experiment!InstanceContainer} - Implementation of an {@link experiment!IInstanceContainer} that creates
 *     new actor instances, and automatically finalizes least recently used actor instances when the container capacity
 *     is reached. Internally, creates {@link experiment.InstanceWrapper}s to achieve the latter functionality.
 * * {@link experiment!IInstanceWrapper} - Abstraction of a **proxy around a plain actor instance** that provides locking
 *   (both on actor and on action level) and automatic activation/deactivation.
 *   * {@link experiment!InstanceWrapper} - Default implementation of an {@link experiment!IInstanceWrapper}. 
 * 
 * ## Types for remotely invoking actors
 * 
 * The following abstractions and implementations provide functionality to invoke actors that run in other processes:
 * 
 * * {@link experiment!IPortal} - Abstraction of a portal that delivers **proxies to remote actors**. These proxies 
 *   can be used by user code to invoke actions on the remote actors.
 *   * {@link experiment!RemotePortal} - Implementation of {@link experiment!IPortal} that uses a {@link experiment!IRemote}
 *     to make calls to actors in another process. When action calls are not successful due to technical reasons, the remote
 *     portal automatically performs retries with an {@link experiment!IBackOff} strategy (for example, an 
 *     {@link experiment!ExponentialBackOff} that waits exponentially longer between retries).
 * * {@link experiment!IRemote} - Abstraction of a **remote actor invocation mechanism** that makes it possible to invoke
 *     actions on remote actors and wait for the result.
 *   * {@link experiment!TransportRemote} - Implementation of {@link experiment!IRemote} that uses an {@link infra!ITransport} to 
 *     send and receive the actual messages to/from the remote applications.
 *   * {@link experiment!InProcessRemote} - Implementation of {@link experiment!IRemote} that does not use a transport layer, but
 *     uses an {@link experiment!IMultiTypeInstanceContainer} to invoke actions on actors within the current process. Useful to
 *     be used as remote for a {@link experiment!RemotePortal} to have exactly the same invocation and error correction behaviour
 *     as would be the case for remote apps, but without the hassle of setting up a transport.
 * * {@link infra!ITransport} - Abstraction of a **transport layer** that allows sending and receiving messages to other applications.  
 *   * {@link infra!NatsTransport} - Implementation of {@link infra!ITransport} that uses the Nats message bus for sending and receiving messages
 *     to other applications.
 * * {@link experiment!IBackOff} - Abstraction of a **backoff mechanism** that waits for a certain amount of time on every invocation.
 *   * {@link experiment!ExponentialBackOff} - Implementation of {@link experiment!IBackOff} that waits for an exponentially longer
 *     period on every subsequent invocation.
 *   * {@link experiment!ImmediateBackOff} - Implementation of {@link experiment!IBackOff} that immediately returns without any delay.
 *     Useful to speed up unit tests.
 * 
 *  ## Types for creating an application
 * 
 * The following implementations can be used to **create an application that hosts actors**:
 * * {@link experiment!ActorRunnerBuilder} - Class that can be used to construct an actor runner with various settings
 * * {@link experiment!ActorRunner} - Class that represents an actor runner that runs and manages actors.
 * @packageDocumentation
 */
export * from './shared';
export * from './instances';
export * from './remoteinvocation';
export * from './localinvocation';
export * from './transportremote';
export * from './running';
export * from './infra/natsserver';
