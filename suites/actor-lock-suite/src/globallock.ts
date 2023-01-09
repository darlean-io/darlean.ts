
export interface IAcquireGlobalLockOptions {
    acquireId?: string;
    id: string[];
    requester: string;
    ttl: number;
    singleStage?: boolean;
}

export interface IReleaseGlobalLockOptions {
    id: string[];
    requester: string;
    acquireId?: string;
  }
  
export interface IAcquireGlobalLockResult {
    duration: number;
    holders: string[];
}

export interface IGetLockHoldersOptions {
    id: string[];
}

export interface ILockHolder {
    holder: string;
}

export interface IGetLockHoldersResult {
    holders: ILockHolder[];
}


export interface IGlobalLock {
    acquire(options: IAcquireGlobalLockOptions): Promise<IAcquireGlobalLockResult>;
    release(options: IReleaseGlobalLockOptions): Promise<void>;
    getLockHolders(options: IGetLockHoldersOptions): Promise<IGetLockHoldersResult>;
}
