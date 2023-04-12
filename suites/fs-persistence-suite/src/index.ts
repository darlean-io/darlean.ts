/**
 * Suite that provides the File System Persistency service.
 *
 * The file system persistence service provides persistency by storing data in SQLite databases on regular or
 * shared filesystem.
 *
 * @packageDocumentation
 */

import { ActorSuite, ApplicationError, FS_PERSISTENCE_SERVICE as baseService } from '@darlean/base';
import { IConfigEnv, wildcardMatch } from '@darlean/utils';
import { FsPersistenceActor } from './syncactor.impl';
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

export function createFsPersistenceSuite(options: IFsPersistenceOptions) {
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
                return new FsPersistenceActor(path);
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

export interface IFileSystemCompartmentCfg {
    compartment: string;
    shardCount?: number;
    nodes?: string[];
    basePath?: string;
    subPath?: string;
}

export interface IFileSystemPersistenceCfg {
    enabled?: boolean;
    maxShardCount?: number;
    compartments: IFileSystemCompartmentCfg[];
    basePath?: string;
    shardCount?: number;
}

export function createFsPersistenceSuiteFromConfig(env: IConfigEnv<IFileSystemPersistenceCfg>, runtimeEnabled: boolean) {
    if (env.fetchBoolean('enabled') ?? runtimeEnabled) {
        const options: IFsPersistenceOptions = {
            compartments: []
        };

        const maxShardCount = env.fetchNumber('maxShardCount');
        const DEFAULT_COMPARTMENT: IFsPersistenceCompartment = {
            compartment: 'fs.*',
            basePath: env.fetchString('basePath') ?? './persistence/',
            shardCount: limit(env.fetchNumber('shardCount') ?? DEFAULT_SHARD_COUNT, maxShardCount)
        };

        for (const comp of [DEFAULT_COMPARTMENT, ...(env.fetchRaw('compartments') ?? [])]) {
            options.compartments.push({
                compartment: comp.compartment,
                basePath: comp.basePath,
                subPath: comp.subPath,
                nodes: comp.nodes,
                shardCount: limit(comp.shardCount ?? DEFAULT_SHARD_COUNT, maxShardCount)
            });
        }

        return createFsPersistenceSuite(options);
    }
}

function limit(n: number | undefined, max: number | undefined): number | undefined {
    if (n === undefined) {
        return undefined;
    }
    return max === undefined || n <= max ? n : max;
}
