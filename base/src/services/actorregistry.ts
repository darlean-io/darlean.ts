/**
 * Actor type for the Actor Registry Service
 */
export const ACTOR_REGISTRY_SERVICE = 'io.darlean.ActorRegistryService';

export interface IActorRegistryService {
    obtain(options: IActorRegistryService_Obtain_Request): Promise<IActorRegistryService_Obtain_Response>;
    push(options: IActorRegistryService_Push_Request): Promise<void>;
}

export interface IActorRegistryService_Obtain_Request {
    actorTypes?: string[];
    nonce?: string;
}

export interface IActorRegistryApplicationInfo {
    name: string;
}

export interface IActorRegistryActorPlacement {
    appBindIdx?: number;
    sticky?: boolean;
}

export interface IActorRegistryActorInfo {
    applications: IActorRegistryApplicationInfo[];
    placement: IActorRegistryActorPlacement;
}

export interface IActorRegistryService_Obtain_Response {
    nonce: string;
    actorInfo?: { [actorType: string]: IActorRegistryActorInfo };
}

export interface IActorRegistryActorPushInfo {
    placement: IActorRegistryActorPlacement;
}

export interface IActorRegistryService_Push_Request {
    application: string;
    actorInfo: { [actorType: string]: IActorRegistryActorPushInfo };
}
