/**
 * Suite that provides the generic Persistency Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, FS_PERSISTENCE_SERVICE, PERSISTENCE_SERVICE as baseService } from '@darlean/base';
import { IConfigEnv } from '@darlean/utils';
import { IPersistenceServiceOptions, PersistenceService } from './service.impl';

export const PERSISTENCE_SERVICE = baseService;
export * from './service.impl';

export function createPersistenceSuite(options: IPersistenceServiceOptions) {
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

export interface IPersistenceCfg {
    enabled?: boolean;
    specifiers: IPersistenceSpecifierCfg[];
    handlers: IPersistenceHandlerCfg[];
}

export interface IPersistenceSpecifierCfg {
    specifier: string;
    compartment: string;
}

export interface IPersistenceHandlerCfg {
    compartment: string;
    actorType: string;
}

export function createPersistenceSuiteFromConfig(env: IConfigEnv<IPersistenceCfg>) {
    if (env.fetchBoolean('enabled') === false) {
        return;
    }

    const options: IPersistenceServiceOptions = {
        compartments: [],
        handlers: []
    };

    const DEFAULT_SPECIFIER: IPersistenceSpecifierCfg = {
        specifier: '*',
        compartment: 'fs.default'
    };

    for (const spec of [...(env.fetchRaw('specifiers') ?? []), DEFAULT_SPECIFIER]) {
        options.compartments.push({
            compartment: spec.compartment,
            specifier: spec.specifier
        });
    }

    const DEFAULT_HANDLER: IPersistenceHandlerCfg = {
        compartment: 'fs.*',
        actorType: FS_PERSISTENCE_SERVICE
    };
    for (const handler of [...(env.fetchRaw('handlers') ?? []), DEFAULT_HANDLER]) {
        options.handlers.push({
            compartment: handler.compartment,
            actorType: handler.actorType
        });
    }

    return createPersistenceSuite(options);
}
