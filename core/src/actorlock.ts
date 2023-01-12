import { IActorLockService } from '@darlean/actor-lock-suite';
import { FrameworkError, FRAMEWORK_ERROR_ACTOR_LOCK_FAILED, FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION } from '@darlean/base';
import { ITime } from '@darlean/utils';

export interface IAcquiredActorLock {
    release(): Promise<void>;
}

export interface IActorLock {
    acquire(id: string[], onBroken: () => void): Promise<IAcquiredActorLock>;
}

export class DistributedActorLock implements IActorLock {
    private service: IActorLockService;
    private time: ITime;
    private appId: string;

    constructor(time: ITime, service: IActorLockService, appId: string) {
        this.time = time;
        this.service = service;
        this.appId = appId;
    }

    public async acquire(id: string[], onBroken: () => void): Promise<IAcquiredActorLock> {
        // const now = this.time.machineTicks();

        const result = await this.service.acquire({
            id,
            requester: this.appId,
            ttl: 60 * 1000,
            singleStage: true
        });

        // TODO: Better checks on result.duration, use remaining duration to determine when to check next time
        if (result.duration > 0) {
            // let until = now + result.duration;
            const refreshTimer = this.time.repeat(
                async () => {
                    console.log('Refreshing', this.appId, id);
                    // const refreshNow = this.time.machineTicks();
                    const refreshResult = await this.service.acquire({
                        id,
                        requester: this.appId,
                        ttl: 60 * 1000,
                        singleStage: true
                    });
                    if (refreshResult.duration > 0) {
                        // until = refreshNow + refreshResult.duration;
                    } else {
                        onBroken();
                    }
                },
                'ActorLockRefresh ' + JSON.stringify(id),
                30 * 1000
            );
            return {
                release: async () => {
                    refreshTimer.cancel();
                    await this.service.release({
                        id,
                        requester: this.appId
                    });
                }
            };
        } else {
            throw new FrameworkError(
                FRAMEWORK_ERROR_ACTOR_LOCK_FAILED,
                `It was not possible to acquire the actor lock for [Id]. It is likely hold by one of [${FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION}].`,
                { [FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION]: result.holders, Id: id }
            );
        }
    }
}
