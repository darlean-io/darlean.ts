export interface IActorLockService {
    acquire(options: IActorLockService_Acquire_Request): Promise<IActorLockService_Acquire_Response>;
    release(options: IActorLockService_Release_Request): Promise<void>;   
    getLockHolders(options: IActorLockService_GetLockHolders_Request): Promise<IActorLockService_GetLockHolders_Response>;
}

export interface IActorLockService_Acquire_Request {
    id: string[];
    requester: string;
    ttl: number;
    singleStage?: boolean;
}

export interface IActorLockService_Acquire_Response {
    duration: number;
    holders: string[];
}

export interface IActorLockService_Release_Request {
    id: string[];
    requester: string;
    acquireId?: string;
}

export interface IActorLockService_GetLockHolders_Request {
    id: string[];
}

export interface ILockHolder {
    holder: string;
}

export interface IActorLockService_GetLockHolders_Response {
    holders: ILockHolder[];
}

export interface IActorLockServiceOptions {
    cluster: string;
}
