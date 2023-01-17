/**
 * Provides Darlean core functionality for hosting and invoking local or remote actors.
 *
 * Detailed information about what virtual actors are and how to write them is in the documentation for {@link @darlean/base}.
 *
 *  ## Types for creating an application
 *
 * The following implementations can be used to **create an application that hosts actors**:
 * * {@link ActorRunnerBuilder} - Class that can be used to construct an actor runner with various settings
 * * {@link ActorRunner} - Class that represents an actor runner that runs and manages actors.
 *
 * ## Actors, instances and wrappers
 *
 * Actors are just plain classes with public async action methods, decorated with {@link action|@action}. They can
 * optionally implement {@link IActivatable} by adding an async {@link IActivatable.activate} method
 * and/or {@link IDeactivatable} by adding an async {@link IDeactivatable.deactivate} method.
 *
 * Although it is possible to instantiate and/or invoke such an actor instance directly by calling
 * its methods, the locking and automatic activation/deactivation that normally takes place is
 * then bypassed. Therefore, it is not recommended to directly create and invoke actor instances
 * (except, for example, for unit tests that do not require this additional behaviour).
 *
 * The prefered way of invoking actor instances is by means of an {@link InstanceWrapper}, either
 * directly by creating a new {@link InstanceWrapper} around a certain actor instance, or by creating
 * an {@link InstanceContainer} with an {@link InstanceCreator} that creates new instances
 * on the fly (and also deactivates instances when the configured container capacity is exceeded).
 *
 * Both {@link InstanceWrapper} and {@link InstanceContainer} respect the configured locking and
 * activation/deactivation mechanisms (by means of the {@link action|@action} decorator and the
 * settings in {@link IActorRegistrationOptions.kind}.
 *
 * ## Local actor invocation
 * For local use (that is, when all code and actors live in the same process, divided over 1 or more internal apps), it is possible to use an instance of {@link InProcessTransport}
 * and pass it to the {@link ActorRunnerBuilder.setRemoteAccess} calls of each of the internal apps..
 *
 * ## Remote actor invocation
 *
 * User code can invoke remote actors by first obtaining an {@link IPortal} instance (like {@link RemotePortal} or
 * {@link localinvocation.LocalPortal}) and then obtaining a local actor proxy by means of {@link IPortal.retrieve}.
 *
 * The default {@link IPortal} implementation, {@link RemotePortal}, has a reference to an {@link IRemote} to
 * perform the actual remote action calls (via {@link IRemote.invoke}). It converts the method calls on the
 * proxy objects to an {@link IInvokeOptions} object with an {@link IActorCallRequest} as content, then
 * performs the call via {@link IRemote.invoke}, awaits the answer (which is an {@link IInvokeResult} with an
 * {@link IActorCallResponse} as content), and returns the {@link IActorCallResponse.result} or throws an
 * {@link ApplicationError} (when the remote actor threw an exception) or a {@link FrameworkError} when the request
 * could not be complete due to technical causes.
 *
 * ### Backoff mechanism
 *
 * In order to handle short-living network issues and actor reincarnation without having to bother the user code
 * with that, the {@link RemotePortal} repeatedly retries to invoke the remote actor with certain time
 * intervals. This backoff mechanism is provided by an {@link IBackOff} instance like {@link ExponentialBackOff},
 * which provides a backoff with exponentially increasing delays.
 *
 * ### Actor placement
 *
 * In order to know to which destination (app) an {@link IActorCallRequest} should be sent to, the {@link RemotePortal}
 * uses an {@link IActorRegistry}, of which {@link ActorRegistry} is an implementation that is used to administer the actors
 * hosted by the current application, and {@link DistributedActorRegistry} provides access to the distributed actor registry that
 * contains actor information from all applications in the cluster.
 *
 * @packageDocumentation
 */
export * from './shared';
export * from './instances';
export * from './remoteinvocation';
export * from './transportremote';
export * from './running';
export * from './actorlock';
export * from './distributedactorregistry';
export * from './infra';
export * from './infra/natsserver';
export * from './infra/inprocesstransport';
