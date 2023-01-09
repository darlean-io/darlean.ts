import { currentScope, encodeKey, ITime } from "@darlean/utils";
import { IAcquireGlobalLockOptions, IAcquireGlobalLockResult, IGetLockHoldersOptions, IGetLockHoldersResult, IReleaseGlobalLockOptions } from "./globallock";

interface ILockInfo {
  acquireId?: string;
  id: string[];
  holder: string;
  until: number;
  timer: NodeJS.Timeout;
}

interface ILockInfo2 {
  id: string[];
  holder: string;
  ttl: number;
}

// Implementation of a lock that simply uses an in-memory map. No redundancy
// (communication with other lock instances) is supported.
export class InProcessGlobalLock {
  protected locks: Map<string, ILockInfo>;
  protected duration: number;
  protected time: ITime;

  constructor(time: ITime, duration: number = 60 * 1000) {
    this.time = time;
    this.locks = new Map();
    this.duration = duration;
  }

  public stop(): void {
    for (const lock of this.locks.values()) {
      clearTimeout(lock.timer);
    }
    this.locks.clear();
  }

  public async acquire(options: IAcquireGlobalLockOptions): Promise<IAcquireGlobalLockResult> {
    const scope = currentScope();

    scope.deep('Try to acquire lock for [Id] by [Requester]', () => ({ Id: options.id, Requester: options.requester }));
    const idAsString = encodeKey(options.id);
    const current = this.locks.get(idAsString);
    const now = this.time.machineTicks();
    if (current) {
      if (current.until > now) {
        if (current.holder !== options.requester) {
          scope.deep('Rejected');
          return {
            duration: 0,
            holders: [current.holder]
          };
        }
      }
    }

    const duration = options.ttl ?? this.duration;

    if (current) {
      clearTimeout(current.timer);
    }

    const value: ILockInfo = {
      acquireId: options.acquireId,
      holder: options.requester,
      id: options.id,
      until: now + duration,
      timer: setTimeout(() => {
        this.locks.delete(idAsString);
      }, 2 * duration)
    };

    this.locks.set(idAsString, value);
    scope.deep('Granted');
    return {
      duration,
      holders: [options.requester]
    };
  }

  public async release(options: IReleaseGlobalLockOptions): Promise<void> {
    const idAsString = encodeKey(options.id);
    const current = this.locks.get(idAsString);
    if (current) {
      if (current.holder === options.requester) {
        if ((options.acquireId === undefined) || (options.acquireId === current.acquireId)) {
          clearTimeout(current.timer);
          this.locks.delete(idAsString);
        }
      }
    }
  }

  public async getLockHolders(options: IGetLockHoldersOptions): Promise<IGetLockHoldersResult> {
    const idAsString = encodeKey(options.id);
    const current = this.locks.get(idAsString);
    const now = this.time.machineTicks();
    if (current) {
      if (current.until > now) {
        return {holders: [{holder: current.holder}]};
      }
    }
    return {holders: []};
  }

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
  }
}
