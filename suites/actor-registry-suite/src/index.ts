/**
 * Suite that provides the Darlean Actor Registry service.
 *
 * The Actor Registry service maintains an administration of which actor types are hosted by which applications, and also
 * provides placement information for each actor type.
 *
 * @packageDocumentation
 */

import { ActorSuite } from '@darlean/base';
import { ActorRegistryService } from './service.impl';

export * from './intf';

export const ACTOR_REGISTRY_SERVICE = 'io.darlean.ActorRegistryService';

export default function suite(hosts: string[]) {
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
