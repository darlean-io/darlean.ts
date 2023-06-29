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

/**
 * Creates a new persistence suite with the provided options.
 */
export function createPersistenceSuite(options: IPersistenceServiceOptions) {
    return new ActorSuite([
        {
            type: PERSISTENCE_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                return new PersistenceService(options, context.portal, context.deser);
            }
        }
    ]);
}

export interface IPersistenceCfg {
    enabled?: boolean;
    specifiers: IPersistenceSpecifierCfg[];
    handlers: IPersistenceHandlerCfg[];
}

/**
 * Configures one mapping from specifier to compartment.
 */
export interface IPersistenceSpecifierCfg {
    /**
     * The specifier. Can contain wildcards (`'*'`).
     */
    specifier: string;

    /**
     * The corresponding compartment. Can contain wildcard placeholders like `'${*}'` and `'${**}'` that are
     * replaced with the matched values of the first respectively second wildcard character from the `specifier`.
     */
    compartment: string;
}

/**
 * Configures one mapping from compartment to actorType.
 */
export interface IPersistenceHandlerCfg {
    /**
     * The compartment. Can contain wildcards (`'*'`).
     */
    compartment: string;
    /**
     * The actor type that should handle requests for the `compartment`.
     */
    actorType: string;
}

/**
 * Creates a new persistence suite from the specified configuration. This is a wrapper around {@link createPersistenceSuite}.
 *
 * A default specifier mapping that maps specifier `'*'` to compartment `'fs.default'` is automatically created, but it can
 * be overruled by explicitly providing a different mapping for specifier `'*'`.
 *
 * A default handler mapping that maps compartments `'fs.*'` to the actor type for {@link FS_PERSISTENCE_SERVICE} is automatically
 * created, but it can be overruled by explicitly providing a different mapping for compartment `'fs.*'`.
 *
 * @param config The configuration for the suite
 * @param runtimeEnabled Indicates whether the suite is created when the `enabled` config option is undefined.
 * @returns The created suite.
 */
export function createPersistenceSuiteFromConfig(config: IConfigEnv<IPersistenceCfg>, runtimeEnabled: boolean) {
    if (config.fetchBoolean('enabled') ?? runtimeEnabled) {
        const options: IPersistenceServiceOptions = {
            compartments: [],
            handlers: []
        };

        const DEFAULT_SPECIFIER: IPersistenceSpecifierCfg = {
            specifier: '*',
            compartment: 'fs.default'
        };

        for (const spec of [...(config.fetchRaw('specifiers') ?? []), DEFAULT_SPECIFIER]) {
            options.compartments.push({
                compartment: spec.compartment,
                specifier: spec.specifier
            });
        }

        const DEFAULT_HANDLER: IPersistenceHandlerCfg = {
            compartment: 'fs.*',
            actorType: FS_PERSISTENCE_SERVICE
        };
        for (const handler of [...(config.fetchRaw('handlers') ?? []), DEFAULT_HANDLER]) {
            options.handlers.push({
                compartment: handler.compartment,
                actorType: handler.actorType
            });
        }

        return createPersistenceSuite(options);
    }
}
