import { action, actor } from "@darlean/base";
import { ITime } from "@darlean/utils";
import { InProcessGlobalLock } from "./inprocessgloballock";
import { IActorLockService_Acquire_Response, IActorLockService_GetLockHolders_Request, IActorLockService_Release_Request } from "./intf";

export interface IActorLockActor_Acquire_Request {
    id: string[];
    requester: string;
    ttl: number;
    acquireId?: string;
}

export interface IActorLockActor_GetLockHolder_Response {
    holder?: string;
}

@actor()
export class ActorLockActor {

    private lock: InProcessGlobalLock;
    
    constructor(time: ITime) {
        this.lock = new InProcessGlobalLock(time, 1000);
    }

    @action()
    public async acquire(request: IActorLockActor_Acquire_Request): Promise<IActorLockService_Acquire_Response> {
        const result = await this.lock.acquire({
            acquireId: request.acquireId,
            id: request.id,
            requester: request.requester,
            ttl: request.ttl
        });
        return result;
   }

   @action()
   public async release(request: IActorLockService_Release_Request): Promise<void> {
       await this.lock.release({
           id: request.id,
           requester: request.requester,
           acquireId: request.acquireId,
       });
  }

  @action()
  public async getLockHolder(request: IActorLockService_GetLockHolders_Request): Promise<IActorLockActor_GetLockHolder_Response> {
      const holders = await this.lock.getLockHolders({
          id: request.id
      });
      if (holders.holders.length > 0) {
          return {
              holder: holders.holders[0].holder
          }
      }
      return {};
  }
}