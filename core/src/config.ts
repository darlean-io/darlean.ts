import { IActorRegistrationOptions, IActorSuite } from '@darlean/base';
import { IFsPersistenceOptions } from '@darlean/fs-persistence-suite';
import { IPersistenceServiceOptions } from '@darlean/persistence-suite';
import { ActorRunner, ActorRunnerBuilder } from './running';

export interface IPersistenceSpecifierCfg {
    specifier: string;
    compartment: string;
}

export interface IPersistenceHandlerCfg {
    compartment: string;
    actorType: string;
}

export interface IFileSystemCompartmentCfg {
    compartment: string;
    partitionKeyLen?: number;
    sortKeyLen?: number;
    shardCount?: number;
    nodes?: string[];
    basePath: string;
}

export interface IFileSystemPersistenceCfg {
    enabled?: boolean;
    compartments: IFileSystemCompartmentCfg[];
}

export interface IPersistenceCfg {
    enabled?: boolean;
    specifiers: IPersistenceSpecifierCfg[];
    handlers: IPersistenceHandlerCfg[];
    fs: IFileSystemPersistenceCfg;
}

export interface IActorLockCfg {
    enabled?: boolean;
    apps?: string[];
    redundancy?: number;
}

export interface IActorRegistryCfg {
    enabled?: boolean;
    apps?: string[];
}

export interface IRuntimeCfg {
    enabled?: boolean;
    persistence?: IPersistenceCfg;
    actorLock?: IActorLockCfg;
    actorRegistry?: IActorRegistryCfg;
}

export interface IApplicationCfg {
    appId?: string;
    runtimeApps?: string[];
    runtime?: IRuntimeCfg;
}

export class ConfigRunnerBuilder {
    private config: IApplicationCfg;
    private actors: IActorRegistrationOptions<object>[];
    private envPrefix: string;
    private argPrefix: string;

    constructor(config: IApplicationCfg, envPrefix?: string, argPrefix?: string) {
        this.config = config;
        this.actors = [];
        this.envPrefix = envPrefix ?? 'DARLEAN_';
        this.argPrefix = argPrefix ?? 'darlean-';
    }

    /**
     * Registers an individual actor that must be hosted by the actor runner.
     * @param options The options for the actor.
     * @returns The builder
     */
    public registerActor<T extends object>(options: IActorRegistrationOptions<T>): ConfigRunnerBuilder {
        this.actors.push(options);
        return this;
    }

    /**
     * Registers a suite of actors that must be hosted by the actor runner.
     * @param suite The suite to be registered
     * @returns The builder
     */
    public registerSuite(suite: IActorSuite): ConfigRunnerBuilder {
        for (const options of suite.getRegistrationOptions()) {
            this.registerActor(options);
        }
        return this;
    }

    public build(): ActorRunner {
        const config = this.config;
        const builder = new ActorRunnerBuilder();

        const appId = this.fetchString('APP_ID', 'app-id') ?? config.appId ?? 'app';
        const runtimeApps = this.fetchString('RUNTIME_APPS', 'runtime-apps')
            ?.split(',')
            .map((x) => x.trim()) ??
            config.runtimeApps ?? [appId];
        const runtimeEnabledString = this.fetchString('RUNTIME_ENABLED', 'runtime-enabled');
        const runtimeEnabled =
            runtimeEnabledString === undefined ? config.runtime?.enabled : runtimeEnabledString.toLowerCase() === 'true';

        builder.setRemoteAccess(appId);
        builder.setRuntimeApps(runtimeApps);

        if (runtimeEnabled) {
            const runtime = this.config.runtime;

            if (!(runtime?.actorLock?.enabled === false)) {
                builder.hostActorLock(runtime?.actorLock?.apps ?? runtimeApps, runtime?.actorLock?.redundancy ?? 3);
            }

            if (!(runtime?.actorRegistry?.enabled === false)) {
                builder.hostActorRegistry(runtime?.actorRegistry?.apps ?? runtimeApps);
            }

            if (!(runtime?.persistence?.enabled === false)) {
                const options: IPersistenceServiceOptions = {
                    compartments: [],
                    handlers: []
                };
                for (const spec of runtime?.persistence?.specifiers || []) {
                    options.compartments.push({
                        compartment: spec.compartment,
                        specifier: spec.specifier
                    });
                }
                for (const handler of runtime?.persistence?.handlers || []) {
                    options.handlers.push({
                        compartment: handler.compartment,
                        actorType: handler.actorType
                    });
                }
                builder.hostPersistence(options);
            }

            if (!(runtime?.persistence?.fs?.enabled === false)) {
                const options: IFsPersistenceOptions = {
                    compartments: []
                };
                for (const comp of runtime?.persistence?.fs?.compartments || []) {
                    options.compartments.push({
                        compartment: comp.compartment,
                        basePath: comp.basePath,
                        nodes: comp.nodes,
                        partitionKeyLen: comp.partitionKeyLen,
                        sortKeyLen: comp.sortKeyLen,
                        shardCount: comp.shardCount
                    });
                }
                builder.hostFsPersistence(options);
            }
        }

        for (const actor of this.actors) {
            builder.registerActor(actor);
        }

        return builder.build();
    }

    protected fetchString(envName: string, argName: string): string | undefined {
        const a = this.argPrefix + argName;
        const idx = process.argv.indexOf('--' + a);
        if (idx >= 0) {
            const value = process.argv[idx + 1];
            if (value !== undefined) {
                return value;
            }
        }
        const e = this.envPrefix + envName;
        const v = process.env[e];
        return v;
    }
}
