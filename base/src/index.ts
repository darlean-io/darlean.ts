/**
 * Provides base types and abstractions for defining custom actors.
 *
 * ## Introduction
 *
 * This library provides the types and abstractions that can be used to build custom actors.
 * 
 * An actor is a combination of state (data) and actions (logic), implemented as an object with one or more 
 * private fields that contain the state, and one or more asynchronous methods that implement the actions. What
 * makes actors different from regular objects is that they can be moved from one node (process) to the other
 * without noticable loss of availability. This is achieved by providing actors with a persistence interface that
 * allows actors to easily load and store their state, in combination with a distributed actor placement administration
 * that knows which actor is active at which node at any given moment.
 * 
 * The complexity of querying this administration, 
 * invoking remote actors via a message bus and performing automatic retries when actors are momentarily not available 
 * while they are reincarnating on a different node are hidden from the
 * developer by means of interfaces like {@link IPortal} that provides and proxies (stubs) that allow the developer to execute
 * actions on a remote actor as if it were a regular local object. 
 * 
 * The functionality of this library is divided into 3 parts: defining actors; hosting actors; and invoking remote actors.
 * 
 * ## Part 1: Defining actors
 *
 * Actors are just plain typescript objects with some decoration applied. The decorators help Darlean understand
 * that the object is a virtual actor ({@link @actor}) or a service actor ({@link @service}), and that a method is an action that 
 * is intended to be invoked from remote code ({@link @action}).
 *
 * Actors can choose to implement the {@link IActivatable.activate} and/or {@link IDeactivatable.deactivate} lifecycle methods.
 * When present, Darlean automatically invokes these methods just before the first action is invoked on a newly created actor 
 * instance, and just after an existing already activated instance is finalized, respectively. The exact conditions when finalizing
 * is performed depend on the chosen imlementation and configuration for the {@link IInstanceContainer} that manages the 
 * lifecycle of the instances of a particular actor type. The default implementation,
 * {@link InstanceContainer}, for example maintains a least-recently-used administration from which the oldest items are removed
 * when the number of actor instances in the container exceeds a predefined capacity threshold.
 *
 * Internally, every actor instance is wrapped in an {@link IInstanceWrapper}, which takes care of global actor
 * uniqueness (a given actor is guaranteed to only exists at most once within the entire cluster) and action locking. Both can
 * be enabled/disabled and configured via the {@link actor | @actor}/{@link service | @service} and {@link action | @action}
 * decorators, respectively.
 * 
 * ### Example
 * 
 * As an illustration, we provide a simple thermostat actor that can be used to get the current temperature and to make
 * it warmer (or colder).
 * 
 * It is good practice to define the interface to the actor in a separate file. This allows a developer to invoke the actor
 * from anotehr process without having to include the implementation (and associated dependencies) of the remote actor in his
 * application.
 * 
 * ```ts
 * // thermostat.intf.ts
 * 
 * interface IThermostatActor {
 *     makeWarmer(amount: number): Promise<number>;
 *     getTemperature(): Promise<number>;
 * }
 * ```
 *
 * The implementation goes in a separate file, that is only required for the process(es) that host the actor:
 * 
 * ```ts
 * // thermostat.impl.ts
 * 
 * import { IThermostatActor } from './thermostat.intf';
 *
 * // It is useful to combine all state fields into a structure to ease persistence of all data.
 * // So if we would have more state fields than just temperature, we would add them to this structure.
 * interface IThermostatState {
 *     temperature: number;
 * }
 *
 * // The actual actor implementation. Should be decorated with @actor (for virtual actors) or
 * // with @service (for service actors).
 * @actor()
 * class ThermostatActor implements IThermostatActor, IActivatable, IDeactivatable {
 *     protected state: IThermostatState;
 *     protected persistence: IPersistence<IThermostatState>;
 *
 *     constructor(persistence: IPersistence<IThermostatState>, initialTemperature?: number) {
 *         this.persistence = persistence;
 *         this.state = {
 *             temperature: initialTemperature ? 16
 *         };
 *     }
 *
 *     // Automatically invoked by the framework just before the first action is called
 *     // Typically loads a previously stored state.
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
 *     // Automatically invoked when the actor is deactivated.
 *     // Typically stores the latest state.
 *     public async deactivate(): Promise<void> {
 *         await this.persistence.store(['state'], this.state);
 *     }
 * }
 * ```
 *
 * ## Part 2: Hosting actors
 * 
 * When an actor is defined, it also needs to be hosted (made accessible for remote invocation).
 * 
 * It is recommended practice that together with one or more related defined actor classes, a 
 * function is exported that takes actor configuration as its input, and returns an {@link IActorSuite}.
 * The {@link IActorSuite} provides Darlean with a {@link IActorSuite.getRegistrationOptions} method that tells
 * Darlean which actors are defined and how to host them.
 * 
 * ```ts
 * // thermostat.impl.ts (continued)
 * export const TEMPERATURE_ACTOR = 'io.darlean.example.TemperatureActor';
 * 
 * export function suite(defaultTemperature: number) {
 *     return new ActorSuite([
 *     {
 *          type: TEMPERATURE_ACTOR,
 *          creator: (context) => {
 *              return new TemperatureActor( 
 *                  context.persistence as IPersistence<IThermostatState>,
 *                  defaultTemperature
 *              );
 *          }
 *     }
 *     ]);
 * }
 * ```
 * 
 * In addition to that, it is necessary to to create, configure and instantiate an {@link ActorRunner}, typically
 * by means of an {@link ActorRunnerBuilder}, and to register our suite via the builder to the runner, but that 
 * is out of scope for this package (which is just about creating actors, not about the details of hosting them, 
 * which is in {@link @darlean/core}).
 * 
 * This package defines certain generic interfaces that the {@link ActorRunner} depends on for doing
 * its job. The interfaces that play a role in the hosting of actors are {@link IInstanceContainer} and {@link IInstanceWrapper}.
 * 
 * Darlean wraps every actor instances in an {@link IInstanceWrapper} instance (of which {@link InstanceWrapper} is the default 
 * implementation). An instance wrapper takes care of:
 * * Invoking the {@link IActivatable.activate} and {@link IDeactivatable.deactivate} methods (if defined) at the proper moments  
 * * Ensuring cluster-wide actor uniqueness (that is, ensuring there is no other process in the cluster that at the same time has
 *   the same actor active)
 * * Providing action-level locking (that is, to ensure that actions that are configured to require exclusive or shared access, actually
 *   receive that locking by queueing requests that would otherwise interfer)
 * * Scheduling the local (non-volatile) timers that allow an actor to invoke certain methods on itself as long as it is active.
 * 
 * An {@link IInstanceContainer} is used to manage multiple instances of a certain actor type; an {@link IMultiTypeInstanceContainer} is
 * used to manage instances of multiple actor types. These containers (implemented by {@link InstanceContainer} and {@link MultiTypeInstanceContainer}))
 * * Maintain an administration of active instances
 * * Create new actor instances (and {@link IInstanceWrapper}s) when required
 * * Automatically deactivate active instances at the proper moment (for example, when there are more active instances than a preconfigured threshold). 
 * 
 * More information about hosting actors is in the documentation for {@link @darlean/core}.  
 *
 * ## Part 3: Invoking remote actors
 * 
 * An actor can invoke remote actors by means of an {@link IPortal} or {@link ITypedPortal} to {@link IPortal.retrieve} a 
 * proxy object to a remote actor. A proxy object can be used as if it were a local object, and
 * action methods on these proxies can be invoked as if the remote actor were running locally (within the same process).
 *
 * ```ts
 * const actor = portal.retrieve<IMyActor>('MyActor', ['123']);
 * await actor.doSomething('a', 345);
 * ```
 *
 * When the type of the actor is already known, an {@link ITypedPortal} can be used. This simplifies
 * the code that invokes the actor and removes dependencies there on the actor type:
 * ```ts
 * const myActorPortal = portal.sub<IMyActor>('MyActor');
 * ...
 * const actor = myActorPortal.retrieve(['123']);
 * await actor.doSomething('a', 345);
 * ```
 * ### Exception propagation
 * Exceptions thrown within the action methods of remote actors are automatically caught, converted into an {@link IActorError}, and propagated to the
 * caller where they are raised as {@link ActorError}.
 * 
 * ### Retries and backoff
 * When the remote actor is (temporarily) unavailable, the portal will perform retries using a configurable {@link IBackOff} mechanism
 * (like an {@link ExponentialBackOff} for a backoff that increases exponentially with every retry).
 * When all retries fail after a certain timeout, an {@link InvokeError} is raised.
 *
 * ### Remotes and transports
 * The default portal implementation, {@link RemotePortal}, uses an {@link IRemote} to {@link IRemote.invoke} actions on remote actors. A
 * remote typically uses an {@link ITransport} (like {@link NatsTransport}) to perform the underlying calls by {@link ITransportSession.send | send}ing
 * an {@link ITransportEnvelope} with an {@link ITransportActorCallRequest} content to another process, and waiting for an 
 * {@link ITransportActorCallResponse} to come back.
 * 
 *
 * @module
 */
export * from './shared';
export * from './instances';
export * from './remoteinvocation';
export * from './running';
export * from './decorations';
export * from './various';
