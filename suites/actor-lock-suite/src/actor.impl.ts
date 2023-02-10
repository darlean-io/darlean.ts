import { action, IDeactivatable } from '@darlean/base';
import { currentScope, encodeKeyFast, ITime } from '@darlean/utils';
import {
    IActorLockService_Acquire_Response,
    IActorLockService_GetLockHolders_Request,
    IActorLockService_Release_Request
} from './intf';

export interface IActorLockActor_Acquire_Request {
    id: string[];
    requester: string;
    ttl: number;
    acquireId?: string;
}

export interface IActorLockActor_GetLockHolder_Response {
    holder?: string;
}

interface ILockInfo {
    acquireId?: string;
    id: string[];
    holder: string;
    until: number;
    timer: NodeJS.Timeout;
}

/*
interface ILockInfo2 {
    id: string[];
    holder: string;
    ttl: number;
}*/

// Although ActorLockActor is in fact an actor, we decorate it as @service to avoid the framework using an
// actor lock (which would cause recursive invocation, because we *are* the actor lock).
// The ActorLockActor is bound to a certain appId so that it is safe to mark it as a service (only one instance
// will exist, namely on the one specified appId in appBindIdx in the suite)
export class ActorLockActor implements IDeactivatable {
    private locks: Map<string, ILockInfo>;
    private duration: number;
    private time: ITime;

    constructor(time: ITime) {
        this.time = time;
        this.locks = new Map();
        this.duration = 1000;
    }

    public async deactivate(): Promise<void> {
        for (const lock of this.locks.values()) {
            clearTimeout(lock.timer);
        }
        this.locks.clear();
    }

    @action()
    public async acquire(request: IActorLockActor_Acquire_Request): Promise<IActorLockService_Acquire_Response> {
        const scope = currentScope();

        scope.deep('Try to acquire lock for [Id] by [Requester]', () => ({ Id: request.id, Requester: request.requester }));
        const idAsString = encodeKeyFast(request.id);
        const current = this.locks.get(idAsString);
        const now = this.time.machineTicks();
        if (current) {
            if (current.until > now) {
                if (current.holder !== request.requester) {
                    scope.deep('Rejected');
                    return {
                        duration: 0,
                        holders: [current.holder]
                    };
                }
            }
        }

        const duration = request.ttl ?? this.duration;

        if (current) {
            clearTimeout(current.timer);
        }

        const value: ILockInfo = {
            acquireId: request.acquireId,
            holder: request.requester,
            id: request.id,
            until: now + duration,
            timer: setTimeout(() => {
                this.locks.delete(idAsString);
            }, 2 * duration)
        };

        this.locks.set(idAsString, value);
        scope.deep('Granted');
        return {
            duration,
            holders: [request.requester]
        };
    }

    @action()
    public async release(request: IActorLockService_Release_Request): Promise<void> {
        const idAsString = encodeKeyFast(request.id);
        const current = this.locks.get(idAsString);
        if (current) {
            if (current.holder === request.requester) {
                if (request.acquireId === undefined || request.acquireId === current.acquireId) {
                    clearTimeout(current.timer);
                    this.locks.delete(idAsString);
                }
            }
        }
    }

    @action()
    public async getLockHolder(
        request: IActorLockService_GetLockHolders_Request
    ): Promise<IActorLockActor_GetLockHolder_Response> {
        const idAsString = encodeKeyFast(request.id);
        const current = this.locks.get(idAsString);
        const now = this.time.machineTicks();
        if (current) {
            if (current.until > now) {
                return { holder: current.holder };
            }
        }
        return { holder: undefined };
    }

    /*
  public inspect(): ILockInfo2[] {
    const now = this.time.machineTicks();
    return Array.from(this.locks.values())
      .filter((v) => v.until >= now)
      .map((v) => {
        return {
          id: v.id,
          holder: v.holder,
          ttl: v.until - now,
        } as ILockInfo2;
      });
  }*/
}
