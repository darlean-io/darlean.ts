/**
 * Suite that provides the Darlean Actor Registry service.
 *
 * The Actor Registry service maintains an administration of which actor types are hosted by which applications, and also
 * provides placement information for each actor type.
 *
 * @packageDocumentation
 */

import { ACTOR_REGISTRY_SERVICE, ActorSuite } from '@darlean/base';
import { IConfigEnv } from '@darlean/utils';
import { ActorRegistryService } from './service.impl';

export function createActorRegistrySuite(hosts: string[]) {
    return new ActorSuite([
        {
            type: ACTOR_REGISTRY_SERVICE,
            kind: 'singular',
            creator: (_context) => {
                return new ActorRegistryService();
            },
            apps: hosts
        }
    ]);
}

export interface IActorRegistryCfg {
    enabled?: boolean;
    apps?: string[];
}

export function createActorRegistrySuiteFromConfig(
    cfg: IConfigEnv<IActorRegistryCfg>,
    runtimeEnabled: boolean,
    runtimeApps: string[]
) {
    if (cfg.fetchBoolean('enabled') ?? runtimeEnabled) {
        const apps = cfg.fetchStringArray('apps') ?? runtimeApps;
        return createActorRegistrySuite(apps);
    }
}
