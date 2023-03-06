/**
 * Suite that provides the File System Persistency service.
 *
 * The file system persistence service provides persistency by storing data in SQLite databases on regular or
 * shared filesystem.
 *
 * @packageDocumentation
 */

import { ActorSuite, ApplicationError, FS_PERSISTENCE_SERVICE as baseService } from '@darlean/base';
import { BsonDeSer, wildcardMatch } from '@darlean/utils';
import { FsPersistenceActor } from './actor.impl';
import { Filterer } from './filtering';
import { FsPersistenceService } from './service.impl';

export const FS_PERSISTENCE_SERVICE = baseService;
const FS_PERSISTENCE_ACTOR = 'io.darlean.FsPersistenceActor';
const DEFAULT_SHARD_COUNT = 8;

export interface IFsPersistenceOptions {
    compartments: IFsPersistenceCompartment[];
}

export interface IFsPersistenceCompartment {
    compartment: string;
    shardCount?: number;
    nodes?: string[];
    basePath?: string;
    subPath?: string;
}

/**
 * Iterates through the list of compartments in options and merges all record for which the
 * compartment mask matches with the provided compartment.
 * @param options The options object that contains the compartments
 * @param compartment The name of the compartment to look for
 * @returns The merged compartment options.
 */
function findOptions(options: IFsPersistenceOptions, compartment: string): IFsPersistenceCompartment {
    let result: IFsPersistenceCompartment | undefined;

    for (const comp of options.compartments) {
        if (wildcardMatch(compartment, comp.compartment)) {
            if (result) {
                result = {
                    basePath: comp.basePath ?? result.basePath,
                    compartment: comp.compartment ?? result.compartment,
                    nodes: comp.nodes ?? result.nodes,
                    shardCount: comp.shardCount ?? result.shardCount,
                    subPath: comp.subPath ?? result.subPath
                };
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
                const shardCount = opts.shardCount ?? DEFAULT_SHARD_COUNT;
                const path = [opts.basePath, opts.subPath, compartment, shardCount, shard, boundNode].join('/');
                const deser = new BsonDeSer();
                const filterer = new Filterer();
                return new FsPersistenceActor(path, context.time, filterer, deser);
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
                        shardCount: opts.shardCount ?? DEFAULT_SHARD_COUNT
                    },
                    portal
                );
            }
        }
    ]);
}
