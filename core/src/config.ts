import { IActorRegistrationOptions, IActorSuite } from '@darlean/base';
import { IFsPersistenceOptions } from '@darlean/fs-persistence-suite';
import { IPersistenceServiceOptions } from '@darlean/persistence-suite';
import { sleep } from '@darlean/utils';
import { InProcessTransport, NatsTransport } from './infra';
import { BsonDeSer } from './infra/bsondeser';
import { NatsServer } from './infra/natsserver';
import { ActorRunner, ActorRunnerBuilder } from './running';
import * as json5 from 'json5';
import * as fs from 'fs';

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
    basePath?: string;
    subPath?: string;
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

/**
 * Configuration for runtime apps that provide a Nats server.
 */
export interface INatsServerCfg {
    /**
     * Enables or disables whether this application launches a Nats server. Default is `false`.
     * Can be overruled by `nats-server-enabled` command-line argument and `NATS_SERVER_ENABLED`
     * environment variable set to `true` or `false`.
     */
    enabled?: boolean;

    /**
     * Port number of the cluster port for the first nats server on a given host. A cluster port is a port on
     * which other nats servers in the cluster connect (regular clients do *not* connect to the cluster port).
     * Subsequent nats servers on the same host are automatically assigned incrementing cluster port numbers.
     * Default value is 4222. Can be uverrules by `nats-cluster-port-base` command-line argument and `NATS_CLUSTER_PORT_BASE`
     * environment variable set to `true` or `false`.
     */
    clusterPortBase?: number;
}

/**
 * Configuration for apps that want to connect as client to Nats.
 */
export interface INatsClientCfg {
    /**
     * List of host names or IP addresses, one for each item in {@link IApplicationCfg.runtimeApps}. Can
     * be overruled by `nats-hosts` command-line argument and `NATS_HOST` environment variable set to a comma-separated
     * list of host names.
     */
    hosts?: string[];

    /**
     * Port number for the first nats server on a given host. Subsequent nats servers on the same host
     * are automatically assigned incrementing port numbers. Default value is 4222. Can be overruled by
     * `nats-base-port` command-line argument and `NATS_BASE_PORT` environment variable.
     */
    basePort?: number;
}

/**
 * Configuration for when this application acts as a runtime application.
 */
export interface IRuntimeCfg {
    /**
     * Enables or disables the provided runtime functionalities. Can be overruled by
     * `runtime-enabled` command-line argument or `RUNTIME_ENABLED` environment variable set to `true` or `false`.
     * @default By default, the runtime functionality is *not* enabled.
     */
    enabled?: boolean;

    /**
     * Configuration of persistence.
     */
    persistence?: IPersistenceCfg;

    /**
     * Configuration of the actor lock.
     */
    actorLock?: IActorLockCfg;

    /**
     * Configuration of the actor registry.
     */
    actorRegistry?: IActorRegistryCfg;

    /**
     * Configuration of the nats message bus.
     */
    nats?: INatsServerCfg;
}

/**
 * Configuration of messaging.
 */
export interface IMessagingCfg {
    /**
     * List of messaging transports that are tried in the order listed. Currently, only an empty array or
     * an array with one element with value `nats` is allowed. Can be overruled by the `messaging-transports` command-line
     * argument or the `MESSAGING_TRANSPORTS` environment parameter, that are either a comma-separated list of transports
     * (currently only 'nats' is allowed) or the word 'none'.
     *
     * @default When explicitly no transports are provided (by means of an empty array or `none` as value for the command-line argument or
     * environment parameter), an {@link InProcessTransport} instance is used which allows in-process communication
     * (but not communication between processes). Otherwise, when the transports are not explicitly assigned and are also not explicitly
     * cleared, the {@link NatsTransport} is used.
     */
    transports: Array<'nats'>;

    /**
     * Client configuration of the Nats message bus.
     */
    nats?: INatsClientCfg;
}

/**
 * Root configuration object for the configuration of a Darlean application.
 *
 * Many of the settings can be overruled by command-line arguments or environment variables. See
 * {@link ConfigRunnerBuilder} for more details.
 */
export interface IApplicationCfg {
    /**
     * The id under which this application is known in the cluster. Must either be set here,
     * or overruled by the `app-id` command-line argument or `APP_ID` environment setting.
     * @default `app`.
     */
    appId?: string;

    /**
     * List of application id's that together provide the runtime of the Darlean cluster
     * (that is, provide the actor registry and actor lock, and optionally provide the
     * nats message bus, persistence and other services).
     * Must either be set here, or overruled by the `runtime-apps` command-line argument or the
     * `RUNTIME_APPS` environment variable with a comma-separated list of application id's.
     * @default an array consisting of just the {@link appId}.
     */
    runtimeApps?: string[];

    /**
     * Optional configuration when this application acts as runtime.
     */
    runtime?: IRuntimeCfg;

    /**
     * Configuration of the message bus that allows inter-application communication.
     */
    messaging?: IMessagingCfg;
}

/**
 * Builds an {@link ActorRunner} instance based on configuration settings, command-line
 * arguments and environment variables.
 *
 * Command-line arguments have priority, followed by environment variables, with the provided
 * configuration data as fall-back.
 *
 * **Command-line arguments** must by default be prefixed with `--darlean-`. So, when the documentation
 * mentions a command-line argument `app-id`, it must by default be provided as `--darlean-app-id`.
 * The value must be provided as the next command-line argument: `--darlean-app-id client03`. When
 * multiple vales are expected, they must be comma-separated.
 *
 * **Environment variables** must by default be prefixed with `DARLEAN_`. So, when the documentation
 * mentions an environment variable `APP_ID`, it must by default be provided as `DARLEAN_APP_ID`.
 * When multiple values are expected, they must be comma-separated.
 *
 * The argument and environment variable prefix can be configured in the constructor.
 *
 * @see {@link IApplicationCfg} for an overview of all the available configuration items.
 */
export class ConfigRunnerBuilder {
    private config?: IApplicationCfg;
    private actors: IActorRegistrationOptions<object>[];
    private envPrefix: string;
    private argPrefix: string;
    private overrides: Map<string, string>;

    constructor(config?: IApplicationCfg, envPrefix?: string, argPrefix?: string) {
        this.config = config;
        this.actors = [];
        this.envPrefix = envPrefix ?? 'DARLEAN_';
        this.argPrefix = argPrefix ?? '--darlean-';
        this.overrides = new Map();
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
        const config = this.deriveConfig();
        this.loadOverrides();

        const builder = new ActorRunnerBuilder();

        const appId = this.fetchString('APP_ID', 'app-id') ?? config.appId ?? 'app';
        const runtimeApps = this.fetchString('RUNTIME_APPS', 'runtime-apps')
            ?.split(',')
            .map((x) => x.trim()) ??
            config.runtimeApps ?? [appId];
        const runtimeEnabledString = this.fetchString('RUNTIME_ENABLED', 'runtime-enabled');
        const runtimeEnabled =
            runtimeEnabledString === undefined ? config.runtime?.enabled : runtimeEnabledString.toLowerCase() === 'true';

        builder.setRuntimeApps(runtimeApps);

        if (runtimeEnabled) {
            const runtime = config.runtime;

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
                        subPath: comp.subPath,
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

        const messagingTransports = this.fetchString('MESSAGING_TRANSPORTS', 'messaging-transports')
            ?.split(',')
            .map((x) => x.trim()) ??
            config.messaging?.transports ?? ['nats'];
        let transportSet = false;
        for (const transport of messagingTransports) {
            if (transport === 'nats') {
                const nats = config.messaging?.nats;
                const seedUrls: string[] = [];

                const hosts = this.deriveHosts(nats, runtimeApps);
                const offsets = this.derivePortOffsets(hosts);
                const basePort = this.fetchNumber('NATS_BASE_PORT', 'nats-base-port') ?? nats?.basePort ?? 4222;
                for (let idx = 0; idx < hosts.length; idx++) {
                    seedUrls.push(hosts[idx] + ':' + (basePort + offsets[idx]).toString());
                }
                builder.setRemoteAccess(appId, new NatsTransport(new BsonDeSer(), seedUrls));
                transportSet = true;
            }
        }

        if (!transportSet) {
            builder.setRemoteAccess(appId, new InProcessTransport(new BsonDeSer()));
        }

        const app = builder.build();

        if (runtimeEnabled && config.runtime?.nats?.enabled) {
            const nats = config.messaging?.nats;
            const runtimenats = config.runtime?.nats;
            const enabled = truefalse(this.fetchString('NATS_SERVER_ENABLED', 'nats-server-enabled')) ?? runtimenats?.enabled;
            if (enabled) {
                const appidx = runtimeApps.indexOf(appId);
                const hosts = this.deriveHosts(nats, runtimeApps);
                if (appidx >= 0 && appidx < hosts.length) {
                    const offsets = this.derivePortOffsets(hosts);
                    const basePort = this.fetchNumber('NATS_BASE_PORT', 'nats-base-port') ?? nats?.basePort ?? 4222;
                    const clusterPortBase =
                        this.fetchNumber('NATS_CLUSTER_BASE_PORT', 'nats-cluster-base-port') ??
                        runtimenats?.clusterPortBase ??
                        5222;
                    const clusterSeeds: string[] = [];
                    for (let idx = 0; idx < hosts.length; idx++) {
                        clusterSeeds.push('nats://' + hosts[idx] + ':' + (clusterPortBase + offsets[idx]).toString());
                    }
                    const clusterListenUrl = 'nats://' + hosts[appidx] + ':' + (clusterPortBase + offsets[appidx]).toString();
                    const serverListenPort = basePort + offsets[appidx];

                    const server = new NatsServer(
                        (stderr) => {
                            console.log('NATS suddenly stopped', stderr);
                        },
                        serverListenPort,
                        clusterSeeds,
                        clusterListenUrl
                    );

                    app.addStarter(async () => {
                        server.start();
                        await sleep(2000);
                    }, 20);

                    app.addStopper(async () => {
                        server.stop();
                        await sleep(2000);
                    }, 20);
                }
            }
        }

        return app;
    }

    protected fetchString(envName: string, argName: string): string | undefined {
        const a = this.argPrefix + argName;
        const idx = process.argv.indexOf(a);
        if (idx >= 0) {
            const value = process.argv[idx + 1];
            if (value !== undefined) {
                return value;
            }
        }

        const e = this.envPrefix + envName;
        const v = process.env[e];
        if (v !== undefined) {
            return v;
        }

        const override = this.overrides.get(argName);
        return override;
    }

    protected fetchNumber(envName: string, argName: string): number | undefined {
        const v = this.fetchString(envName, argName);
        if (v !== undefined) {
            return parseInt(v);
        }
    }

    protected derivePortOffsets(hosts: string[]) {
        const result: number[] = [];
        const ports = new Map<string, number>();
        for (const host of hosts) {
            const lastPort = (ports.get(host) ?? -1) + 1;
            ports.set(host, lastPort);
            result.push(lastPort);
        }
        return result;
    }

    protected deriveHosts(nats: INatsClientCfg | undefined, appIds: string[]) {
        const hosts = this.fetchString('NATS_HOSTS', 'nats-hosts')?.split(',') ?? nats?.hosts ?? [];
        return hosts.slice(0, appIds.length);
    }

    protected deriveConfig(): IApplicationCfg {
        const path = this.fetchString('CONFIG', 'config');
        if (path) {
            const contents = fs.readFileSync(path, { encoding: 'utf-8' });
            return json5.parse(contents) as IApplicationCfg;
        }

        if (this.config) {
            return this.config;
        }

        return {};
    }

    protected loadOverrides() {
        const overrides = this.fetchString('OVERRIDES', 'overrides');
        if (overrides) {
            for (const override of overrides.split(',').map((x) => x.trim())) {
                const contents = fs.readFileSync(override, { encoding: 'utf-8' });
                const lines = contents.split('\n').map((x) => x.trim());
                for (const line of lines) {
                    if (line.startsWith('#') || line.startsWith('//')) {
                        continue;
                    }
                    const p = line.indexOf('=');
                    if (p >= 0) {
                        const key = line.substring(0, p).trim();
                        const value = line.substring(p + 1).trim();
                        this.overrides.set(key, value);
                    }
                }
            }
        }
    }
}

function truefalse(value: string | undefined) {
    if (value === undefined) {
        return undefined;
    }
    return value.toLowerCase() === 'true';
}
