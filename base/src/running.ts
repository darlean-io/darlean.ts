import { IInstanceContainer } from './instances';
import { IActorPlacement, IPortal } from './remoteinvocation';
import { IPersistence, IVolatileTimer } from './various';

export interface IActorRegistrationOptions<T extends object> {
    type: string;
    // Creator function that creates a new actor instance. Can be optional, because client applications may just register an actor
    // to specify the hosts property without being able to create new instances themselves.
    creator?: (context: IActorCreateContext) => T;
    container?: IInstanceContainer<T>;
    capacity?: number;
    placement?: IActorPlacement;

    /**
     * When present, the list of hosts on which this actor can run.
     */
    hosts?: string[];
}

export interface IActorCreateContext {
    id: string[];
    persistence: IPersistence<unknown>;
    portal: IPortal;
    newVolatileTimer(): IVolatileTimer;
}

export interface IActorSuite {
    getRegistrationOptions(): IActorRegistrationOptions<object>[];
}
