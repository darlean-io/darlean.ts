/**
 * Suite that provides the generic Persistency Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, PERSISTENCE_SERVICE as baseService } from '@darlean/base';
import { IPersistenceServiceOptions, PersistenceService } from './service.impl';

export const PERSISTENCE_SERVICE = baseService;
export * from './service.impl';

export default function suite(options: IPersistenceServiceOptions) {
    return new ActorSuite([
        {
            type: PERSISTENCE_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                return new PersistenceService(options, context.portal);
            }
        }
    ]);
}
