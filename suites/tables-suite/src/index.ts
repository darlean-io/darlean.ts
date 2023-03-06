/**
 * Suite that provides the Tables Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, IPersistenceService, PERSISTENCE_SERVICE, TABLE_SERVICE } from '@darlean/base';
import { BsonDeSer } from '@darlean/utils';
import { TableActor } from './table';

export * from './table';

export function createTableSuite() {
    return new ActorSuite([
        {
            type: TABLE_SERVICE,
            kind: 'singular',
            creator: (context) => {
                const name = context.id[0];
                const p = context.portal.retrieve<IPersistenceService>(PERSISTENCE_SERVICE, []);
                return new TableActor(p, new BsonDeSer(), name, 0);
            }
        }
    ]);
}
