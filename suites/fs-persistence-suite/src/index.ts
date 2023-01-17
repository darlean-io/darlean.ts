/**
 * Suite that provides the File System Persistency service.
 *
 * The file system persistence service provides persistency by storing data in SQLite databases on regular or
 * shared filesystem.
 *
 * @packageDocumentation
 */

import { ActorSuite, ApplicationError } from '@darlean/base';
import { wildcardMatch } from '@darlean/utils';
import { FsPersistenceActor } from './actor.impl';
import { FsPersistenceService } from './service.impl';

export const FS_PERSISTENCE_SERVICE = 'io.darlean.FsPersistenceService';
const FS_PERSISTENCE_ACTOR = 'io.darlean.FsPersistenceActor';

export interface IFsPersistenceOptions {
    compartments: IFsPersistenceCompartment[];
}

export interface IFsPersistenceCompartment {
    partitionKeyLen?: number;
    sortKeyLen?: number;
    shardCount?: number;
    nodes?: string[];
    basePath: string;
    filter: string;
}

function findOptions(options: IFsPersistenceOptions, compartment: string): IFsPersistenceCompartment {
    let result: IFsPersistenceCompartment | undefined;

    for (const comp of options.compartments) {
        if (wildcardMatch(compartment, comp.filter)) {
            if (result) {
                result = { ...result, ...comp };
            } else {
                result = comp;
            }
        }
    }

    if (result) {
        return result;
    }

    throw new ApplicationError('NO_COMPARTMENT', 'There is no compartment configured for [Compartment]', {
        Compartment: compartment
    });
}

export default function suite(options: IFsPersistenceOptions) {
    return new ActorSuite([
        {
            type: FS_PERSISTENCE_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const compartment = context.id[0];
                const opts = findOptions(options, compartment);
                const boundNode = context.id[context.id.length - 1] || 'unbound';
                const shard = context.id[context.id.length - 2];
                const path = [opts.basePath, compartment, opts.shardCount, shard, boundNode].join('/');
                return new FsPersistenceActor(path, opts.partitionKeyLen ?? 8, opts.sortKeyLen ?? 8);
            }
        },
        {
            type: FS_PERSISTENCE_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                const compartment = context.id[0];
                const opts = findOptions(options, compartment);
                const portal = context.portal.typed<FsPersistenceActor>(FS_PERSISTENCE_ACTOR).prefix([compartment]);
                return new FsPersistenceService(
                    {
                        nodes: opts.nodes ?? [],
                        shardCount: opts.shardCount ?? 32
                    },
                    portal
                );
            }
        }
    ]);
}
