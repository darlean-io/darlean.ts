/**
 * Provides base types and abstractions for creating custom actor suites.
 *
 * ## Introduction
 *
 * This library provides the types and abstractions that can be used to build custom actor suites.
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
 * developer by means of interfaces like {@link IPortal} and {@link ITypedPortal} that provide proxies (stubs) that allow the developer to execute
 * actions on a remote actor as if it were a regular local object.
 *
 * The functionality of this library is divided into 3 parts: defining actors; exposing actors; and invoking remote actors,
 * that are further described in the sections below.
 *
 * ## Part 1: Defining actors
 *
 * Actors are just plain typescript objects with some decoration applied. The decorators help Darlean understand
 * which methods are actions that are intended to be invoked from remote code ({@link @action}).
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
 * uniqueness (a given actor is guaranteed to only exists at most once within the entire cluster) and action locking.
 * Global actor uniqueness is configured via de `kind` field of the {@link IActorRegistrationOptions} that is used for
 * actor registrartion; per-action locking is configured via the {@link action | @action} decorator of the corresponding method.
 *
 * ### Actor Example
 *
 * As an illustration, we provide a simple thermostat virtual actor that can be used to get the current temperature and to make
 * it warmer (or colder, which is of course what we like for the future of our planet).
 *
 * It is good practice to define the interface to the actor (together with the formal name of the actor) in a separate file. This
 * allows a developer to invoke the actor from another process without having to include the implementation (and
 * associated dependencies) of the remote actor in his application.
 *
 * *Note: Because of Darlean's internal {@link normalizeActionName | normalization} of actor and action names, it is even possible to invoke
 * the same actor from another programming languages using the language-native name casing, like `make_warmer` for python, or `MakeWarmer` for C#).*
 *
 * ```ts
 * // thermostat.intf.ts
 *
 * export const THERMOSTAT_ACTOR = 'io.darlean.example.ThermostatActor';
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
 * // The actual actor implementation.
 * class ThermostatActor implements IThermostatActor, IActivatable, IDeactivatable {
 *     protected state: IPersistable<IThermostatState>;
 *
 *     constructor(persistable: IPersistable<IThermostatState>, initialTemperature?: number) {
 *         this.state = state;
 *         this.state.change({ temperature: initialTemperature ?? 16});
 *     }
 *
 *     // Automatically invoked by the framework just before the first action is called
 *     // Typically loads a previously stored state.
 *     public async activate(): Promise<void> {
 *         await this.state.load();
 *     }
 *
 *     // Action methods must be decorated to make them accessible for remote invocation
 *     @action()
 *     public async makeWarmer(amount: number): Promise<number> {
 *         if (this.state.value) {
 *             this.state.value.temperature += amount;
 *             this.state.change();
 *             return this.state.value.temperature;
 *         }
 *     }
 *
 *     // To alter the default behaviour of actions, add options to the decorator
 *     @action({ locking='shared' })
 *     public async getTemperature(): Promise<number> {
 *         return this.state.value.temperature ?? 0;
 *     }
 *
 *     // Automatically invoked when the actor is deactivated.
 *     // Typically stores the latest state.
 *     public async deactivate(): Promise<void> {
 *         await this.state.store();
 *     }
 * }
 * ```
 *
 * ## Part 2: Exposing actors
 *
 * When an actor is defined, it also needs to be exposed (made accessible for remote invocation) by means of a suite.
 *
 * It is recommended practice that together with one or more related defined actor classes, a
 * creator function is exported that takes actor configuration as its input, and returns an {@link IActorSuite}.
 * The {@link IActorSuite} provides Darlean with a {@link IActorSuite.getRegistrationOptions} method that tells
 * Darlean which actors are defined and how to host them.
 *
 * Example:
 * ```ts
 * // thermostat.impl.ts (continued)
 *
 * export function suite(defaultTemperature: number) {
 *     return new ActorSuite([
 *     {
 *          type: THERMOSTAT_ACTOR,
 *          kind: 'singular',
 *          creator: (context) => {
 *              const persistence = context.persistence as IPersistence<IThermostatState>;
 *              return new ThermostatActor(
 *                  persistence.persistable('state'),
 *                  defaultTemperature
 *              );
 *          }
 *     }
 *     ]);
 * }
 * ```
 *
 * In addition to creating and exporting the suite, it is also necessary to actually run an {@link ActorRunner} and to register
 * the suite with the runner. That is out of scope for this package (which is just about creating and exposing actors, not about 
 * the details of hosting them). For the details on actually hosting suites, see package {@link @darlean/core}).
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
 * const actor = portal.retrieve<IThermostatActor>(THERMOSTAT_ACTOR, ['LivingRoom']);
 * ...
 * const newTemperature = await actor.makeWarmer(-0.2);
 * ```
 *
 * When the type of the actor is already known, an {@link ITypedPortal} can be used. This simplifies
 * the code that invokes the actor and removes dependencies there on the actor type:
 * ```ts
 * const thermostatPortal = portal.typed<IThermostatActor>(THERMOSTAT_ACTOR);
 * ...
 * const actor = thermostatPortal.retrieve(['LivingRoom']);
 * const newTemperature = await actor.makeWarmer(-0.3);
 * ```
 * ### Exception propagation
 * Exceptions thrown within the action methods of remote actors are automatically caught, converted into an {@link IActionError} with `kind = 'application'`, and propagated to the
 * caller where they are raised as {@link ApplicationError}.
 *
 * Exceptions within the Darlean framework while trying to invoke a remote actor (like a timeout, or when the remote app could not be reached)
 * are converted into an {@link IActionError} with `kind = 'framework'`, and propagated to the caller where they are raised as {@link FrameworkError}.
 *
 * ### Retries and backoff
 * When the remote actor is (temporarily) unavailable, the portal will perform retries using a configurable {@link IBackOff} mechanism
 * (like an {@link ExponentialBackOff} for a backoff that increases exponentially with every retry).
 * When all retries fail after a certain timeout, an {@link FrameWorkError} is raised.
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
export * from './services/persistence';
export * from './services/fspersistence';
export * from './services/tables';
export * from './services/timers';
export * from './expressions';
