/**
 * Suite that provides the Darlean Global Actor Lock service.
 *
 * @packageDocumentation
 */

import { ACTOR_LOCK_SERVICE, ActorSuite } from '@darlean/base';
import { IConfigEnv } from '@darlean/utils';
import { ActorLockActor } from './actor.impl';
import { ActorLockService } from './service.impl';

const ACTOR_LOCK_ACTOR = 'io.darlean.ActorLockActor';

export interface IActorLockOptions {
    /**
     * The id of the actor lock. Can be `[]` when there is only one actor lock in the cluster.
     */
    id: string[];

    /**
     * List of application-names that together provide the distributed actor lock
     */
    locks: string[];

    /**
     * The number of nodes on which actor lock information is kept.
     *
     * @remarks
     * * When more than the length of `locks`, the length of `locks` is used as redundancy value.
     * * Because the lock internally uses majority voting, the redundancy typically is an odd value.
     */
    redundancy: number;

    /**
     * Optional timeout value that defines how long (in milliseconds) the internal calls to the distributed stores may take
     * before timing out. Default is 1000 milliseconds.
     */
    timeout?: number;
}

export function createActorLockSuite(options: IActorLockOptions) {
    return new ActorSuite([
        {
            type: ACTOR_LOCK_ACTOR,
            kind: 'multiplar',
            creator: (context) => {
                return new ActorLockActor(context.time);
            },
            placement: {
                version: '20230109',
                bindIdx: -1
            },
            apps: options.locks
        },
        {
            type: ACTOR_LOCK_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                const prefixPortal = context.portal.prefix(options.id);
                const actorPortal = prefixPortal.typed<ActorLockActor>(ACTOR_LOCK_ACTOR);
                return new ActorLockService(actorPortal, options.locks, options.redundancy, options.timeout ?? 1000);
            },
            apps: options.locks
        }
    ]);
}

export interface IActorLockCfg {
    enabled?: boolean;
    apps?: string[];
    redundancy?: number;
}

export function createActorLockSuiteFromConfig(cfg: IConfigEnv<IActorLockCfg>, runtimeEnabled: boolean, runtimeApps: string[]) {
    if (cfg.fetchBoolean('enabled') ?? runtimeEnabled) {
        const options: IActorLockOptions = {
            id: [],
            locks: cfg.fetchStringArray('apps') ?? runtimeApps,
            redundancy: cfg.fetchNumber('redundancy') ?? 3
        };
        return createActorLockSuite(options);
    }
}
