import { IApplicationCfg } from '@darlean/core';
import { FS_PERSISTENCE_SERVICE, IFsPersistenceOptions } from '@darlean/fs-persistence-suite';
import { IPersistenceServiceOptions } from '@darlean/persistence-suite';

export const fsPersistenceConfig: IFsPersistenceOptions = {
    compartments: [
        {
            compartment: '*',
            basePath: './persistence',
            shardCount: 1
        },
        {
            compartment: 'fs.oracle-fact',
            basePath: './persistence/oracle/fact'
        }
    ]
};

export const persistenceConfig: IPersistenceServiceOptions = {
    handlers: [
        {
            compartment: 'fs.*',
            actorType: FS_PERSISTENCE_SERVICE
        }
    ],
    compartments: [
        {
            specifier: 'oracle.fact.*',
            compartment: 'fs.oracle-fact'
        }
    ]
};

export function config(): IApplicationCfg {
    return {
        runtime: {
            enabled: false,
            persistence: {
                handlers: [{ compartment: 'fs.*', actorType: FS_PERSISTENCE_SERVICE }],
                specifiers: [{ specifier: 'oracle.fact.*', compartment: 'fs.oracle-fact' }],
                fs: {
                    compartments: [
                        { compartment: '*', basePath: './persistence', shardCount: 1 },
                        { compartment: 'fs.oracle-fact', basePath: './persistence/oracle/fact' }
                    ]
                }
            }
        }
    };
}
