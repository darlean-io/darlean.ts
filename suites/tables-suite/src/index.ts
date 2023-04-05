/**
 * Suite that provides the Tables Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, IPersistenceService, PERSISTENCE_SERVICE, TABLES_SERVICE } from '@darlean/base';
import { BsonDeSer } from '@darlean/utils';
import { TableActor } from './table';

export * from './table';

export function createTablesSuite() {
    return new ActorSuite([
        {
            type: TABLES_SERVICE,
            kind: 'singular',
            creator: (context) => {
                const id = context.id;
                const p = context.portal.retrieve<IPersistenceService>(PERSISTENCE_SERVICE, []);
                return new TableActor(p, new BsonDeSer(), id, 0);
            }
        }
    ]);
}
