import { IActorLockService } from '@darlean/actor-lock-suite';
import { FrameworkError, FRAMEWORK_ERROR_ACTOR_LOCK_FAILED, FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION } from '@darlean/base';
import { ITime } from '@darlean/utils';

/**
 * Allows the holder of an actor lock to release the lock.
 */
export interface IAcquiredActorLock {
    /**
     * Releases the lock.
     */
    release(): Promise<void>;
}

/**
 * Abstraction of an achtor lock that ensures only one application has
 * ownership of a certain id within a certain time window.
 */
export interface IActorLock {
    /**
     * Acquires unique ownership of the provided id.
     * @param id The id for which the current application wishes to receive unique ownership.
     * @param onBroken Callback that is invoked when the lock detects that the lock
     * is not valid anymore.
     * @throws A {@link FrameworkError} with code {@link FRAMEWORK_ERROR_ACTOR_LOCK_FAILED} to indicate
     * that the lock could not be obtained. The {@link FrameworkError} parameter {@link FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION}
     * should be filled with an array of application names that currently hold the lock (typically only one, but in case of
     * lock conflicts multiple holders could be reported. Don't worry -- only one application will know that it actually holds the lock,
     * so although multiple applications are reported by the lock, only one application will acutally hold te lock. It is just that
     * the (distributed) lock does not know exactly which one). This information can be used by callers to
     * determine which application is the most likely to consult next when they want to invoke actions on the actor.
     */
    acquire(id: string[], onBroken: () => void): Promise<IAcquiredActorLock>;
}

/**
 * Implementation of {@link IActorLock} that uses the distributed actor lock provided in {@link @darlean/actor-lock-suite}.
 */
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
                    // console.log('REFRESH ACTOR LOCK', id);
                    // const refreshNow = this.time.machineTicks();
                    try {
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
                    } catch (e) {
                        console.log('ERROR DURING REFRESH ACTOR LOCK', e);
                        onBroken();
                    }
                },
                'ActorLockRefresh ' + JSON.stringify(id),
                30 * 1000
            );
            return {
                release: async () => {
                    await refreshTimer.cancel();
                    await this.service.release({
                        id,
                        requester: this.appId
                    });
                }
            };
        } else {
            throw new FrameworkError(
                FRAMEWORK_ERROR_ACTOR_LOCK_FAILED,
                `It was not possible to acquire the actor lock for [Id] by [AppId]. It is likely hold by one of [${FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION}].`,
                { [FRAMEWORK_ERROR_PARAMETER_REDIRECT_DESTINATION]: result.holders, Id: id, AppId: this.appId }
            );
        }
    }
}
