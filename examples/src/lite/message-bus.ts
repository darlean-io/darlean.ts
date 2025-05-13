export interface IAction {
    actorType: string;
    actorId: string[];
    actionName: string;
    data: Buffer;
}

export type ActionHandler = (action: IAction) => void;

export interface IRegistration {
    unregister(): void;
}

/**
 * Implemented by an object (like a message bus) that can receive actor events.
 */
export interface IActorSource {
    /**
     * Register for receiving actions for one specific actor
     * @param affinity Whether actions should be received by 'one' party or by 'all' parties.
     */
    registerForActions(affinity: 'one' | 'all', actorType: string, actorId: string[], onAction: ActionHandler): IRegistration;

    /**
     * Register for supporting the provided actor type. Only when registered for support, other parties will send
     * actions for the actor type.
     * @param actorType The actor type that is supported.
     */
    registerForActorType(actorType: string): IRegistration;
}

export interface IActionSendResult {
    reachable: boolean;
    frameworkError: Buffer;
    actionError: Buffer;
    actionResult: Buffer;
}

export interface IActorInstantiateResult {
    reachable: boolean;
    frameworkError: Buffer;
    actionError: Buffer;
    actionResult: Buffer;
}

export interface IActionSendOptions {
    actorType: string;
    actorId: string[];
    actionName: string;
    arguments: Buffer;
    /**
     * Instantiate new actor when not active (anymore). That can happen just after
     * an actor instance is finalized, but 
     */
    instantiation: boolean;
}

export interface IActorInstantiateOptions {
    actorType: string;
    actorId: string[];
    actionName: string;
    arguments: Buffer;
}

export interface IActorSink {
    /**
     * Sends a message to a specific actor. Waits until the message is processed by a remote party.
     * Returns early when the is no receiver for this actor; in that case reachable = false.
     * Does not do any retries or smart things.
     */
    sendAction(options: IActionSendOptions): Promise<IActionSendResult>;

    instantiateActor(actorType: string, actorId: string[], action: IAction): Promise<IActorInstantiateResult>;
}