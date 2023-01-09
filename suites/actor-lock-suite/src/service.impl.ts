import { action, ITypedPortal, service } from "@darlean/base";
import { parallel, ParallelTask } from "@darlean/utils";
import { IActorLockService, IActorLockService_Acquire_Request, IActorLockService_Acquire_Response, IActorLockService_GetLockHolders_Request, IActorLockService_GetLockHolders_Response, IActorLockService_Release_Request } from "./intf";
import * as uuid from "uuid";
import { ActorLockActor, IActorLockActor_GetLockHolder_Response } from "./actor.impl";
import * as crypto from 'crypto';

@service()
export class ActorLockService implements IActorLockService {
    private actorPortal: ITypedPortal<ActorLockActor>;
    private locks: Map<string, {name: string, actor: ActorLockActor}>;
    private lockNames: string[];
    private redundancy: number;
    private timeout: number;
    
    constructor(actorPortal: ITypedPortal<ActorLockActor>, locks: string[], redundancy: number, timeout: number) {
        this.actorPortal = actorPortal;
        this.lockNames = locks;
        this.locks = new Map();
        this.redundancy = redundancy;
        this.timeout = timeout;

        for (const lock of locks) {
            this.locks.set( lock, {
                name: lock,
                actor: this.actorPortal.retrieve([lock])
            });
        }
    }

    @action({locking: 'shared'})
    public async acquire(request: IActorLockService_Acquire_Request): Promise<IActorLockService_Acquire_Response> {
        const tasks: ParallelTask<IActorLockService_Acquire_Response, void>[] = [];
        const holders: string[] = [];
        let responses = 0;
        let duration: number | undefined;
        const acquireId = uuid.v4();
        const locks = this.findLocks(request.id);
        const majority = this.calculateMajority(locks.length);

        for (const lock of locks) {
            tasks.push( async () => {
                const result = await lock.actor.acquire({
                    id: request.id,
                    acquireId,
                    requester: request.requester,
                    ttl: request.ttl
                });

                if (result.holders) {
                    for (const holder of result.holders) {
                        if (!holders.includes(holder)) {
                            holders.push(holder);
                        }
                    }
                }
            
                if (result.duration > 0) {
                    responses++;
                    if ((duration === undefined) || (result.duration < duration)) {
                        duration = result.duration;
                    }
                }

                return result;
            });
        }

        await parallel(tasks, this.timeout);

        if ((duration !== undefined) && (holders.length === 1)) {
            if (responses >= majority) {
                return {
                    holders,
                    duration
                };
            }
        }

        const releases: ParallelTask<void, void>[] = [];
        for (const lock of locks) {
            releases.push( async () => {
                await lock.actor.release({
                        id: request.id,
                        requester: request.requester,
                        acquireId 
                });
            });
        }

        await parallel(releases, this.timeout);
    
        return {
            duration: 0,
            holders
        };
    }

    @action({locking: 'shared'})
    public async release(request: IActorLockService_Release_Request): Promise<void> {
        const locks = this.findLocks(request.id);

        const releases: ParallelTask<void, void>[] = [];
        for (const lock of locks) {
            releases.push( async () => {
                await lock.actor.release({
                        id: request.id,
                        requester: request.requester,
                        acquireId: request.acquireId
                });
            });
        }

        await parallel(releases, this.timeout);
    }

    @action({locking: 'shared'})
    public async getLockHolders(request: IActorLockService_GetLockHolders_Request): Promise<IActorLockService_GetLockHolders_Response> {
        const tasks: ParallelTask<IActorLockActor_GetLockHolder_Response, void>[] = [];
        const locks = this.findLocks(request.id);
        
        for (const lock of locks) {
            tasks.push( async () => {
                const result = await lock.actor.getLockHolder({
                        id: request.id,
                });

                return result;
            });
        }

        const results = await parallel(tasks, this.timeout);

        const holders: string[] = [];
        for (const result of results.results) {
            if (result.result) {
                const holder = result.result.holder;
                if (holder) {
                    if (!holders.includes(holder)) {
                        holders.push(holder);
                    }
            
                }
            }
        }

        return {
            holders: holders.map( h => ({holder: h}))
        };
    }

    protected findLocks(id: string[]) {
        const offset = this.determineOffset(id);
        
        const result = [];
        for (let idx = offset; idx < offset + this.redundancy; idx++) {
            const j = idx % this.lockNames.length;
            const lock = this.locks.get(this.lockNames[j]);
            if (lock) {
                result.push(lock);
            }
        }
        return result;
    }

    protected determineOffset(id: string[]): number {
        const hash = crypto.createHash('sha1');
        for (const elem of id) {
            hash.update(Buffer.from(elem.length + ':'));
            hash.update(elem);
        }
        const buf = hash.digest();
        const val = buf.readUInt16BE();
        return val;
    }

    protected calculateMajority(n: number) {
        return Math.ceil( 0.5 * (n + 0.25) );
    }
}
