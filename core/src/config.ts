import { IActorRegistrationOptions, IActorSuite, IMigrationState } from '@darlean/base';
import { MultiDeSer, ConfigEnv, IConfigEnv, notifier, onApplicationStop, sleep } from '@darlean/utils';
import { InProcessTransport, NatsTransport } from './infra';
import { NatsServer } from './infra/natsserver';
import { ActorRunner, ActorRunnerBuilder } from './running';
import * as json5 from 'json5';
import * as fs from 'fs';
import path from 'path';

const DMB_BASE_PORT = 4500;
const DMB_CLUSTER_PORT_BASE = 5500;

/**
 * Configuration for when this application acts as a runtime application.
 */
export interface IApplicationRuntimeCfg {
    /**
     * Enables or disables the provided runtime functionalities. Can be overruled by
     * `runtime-enabled` command-line argument or `RUNTIME_ENABLED` environment variable set to `true` or `false`.
     * @default By default, the runtime functionality is *not* enabled.
     */
    enabled?: boolean;

    /**
     * Configuration of the DMB message bus server.
     */
    dmb?: IDmbServerCfg;
}

/**
 * Configuration for runtime apps that provide a DMB (Darlean Message Bus) server.
 */
export interface IDmbServerCfg {
    /**
     * Enables or disables whether this application launches a DMB server. Default is `false`.
     * Can be overruled by `dmb-server-enabled` command-line argument and `DMB_SERVER_ENABLED`
     * environment variable set to `true` or `false`.
     */
    enabled?: boolean;

    /**
     * Port number of the cluster port for the first DMB server on a given host. A cluster port is a port on
     * which other DMB servers in the cluster connect (regular clients do *not* connect to the cluster port).
     * Subsequent DMB servers on the same host are automatically assigned incrementing cluster port numbers.
     * Default value is 5500. Can be uverrules by `dmb-cluster-port-base` command-line argument and `DMB_CLUSTER_PORT_BASE`
     * environment variable set to `true` or `false`.
     */
    clusterPortBase?: number;
}

/**
 * Configuration for apps that want to connect as client to the Darlean Message Bus.
 */
export interface IDmbClientCfg {
    /**
     * List of host names or IP addresses, one for each item in {@link IApplicationCfg.runtimeApps}. Can
     * be overruled by `dmb-hosts` command-line argument and `DMB_HOSTS` environment variable set to a comma-separated
     * list of host names.
     */
    hosts?: string[];

    /**
     * Port number for the first DMB server on a given host. Subsequent DMB servers on the same host
     * are automatically assigned incrementing port numbers. Default value is 4500. Can be overruled by
     * `dmb-base-port` command-line argument and `DMB_BASE_PORT` environment variable.
     */
    basePort?: number;
}

/**
 * Configuration of messaging.
 */
export interface IMessagingCfg {
    /**
     * List of messaging transports that are tried in the order listed. Currently, only an empty array or
     * an array with one element with value 'dmb' is allowed. Can be overruled by the `messaging-transports` command-line
     * argument or the `MESSAGING_TRANSPORTS` environment parameter, that are either a comma-separated list of transports
     * (currently only 'dmb' is allowed) or the word 'none'.
     *
     * @default When explicitly no transports are provided (by means of an empty array or `none` as value for the command-line argument or
     * environment parameter), an {@link InProcessTransport} instance is used which allows in-process communication
     * (but not communication between processes). Otherwise, when the transports are not explicitly assigned and are also not explicitly
     * cleared, the {@link NatsTransport} (on which DMB is currently based) is used.
     */
    transports: Array<'dmb'>;

    /**
     * Client configuration of the Darlean Message Bus.
     */
    dmb?: IDmbClientCfg;
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
     * Darlean Message Bus, persistence and other services).
     * Must either be set here, or overruled by the `runtime-apps` command-line argument or the
     * `RUNTIME_APPS` environment variable with a comma-separated list of application id's.
     * @default an array consisting of just the {@link appId}.
     */
    runtimeApps?: string[];

    /**
     * Optional configuration when this application acts as runtime.
     */
    runtime?: IApplicationRuntimeCfg;

    /**
     * Configuration of the message bus that allows inter-application communication.
     */
    messaging?: IMessagingCfg;

    /**
     * Prefix (including path) of the pidFile for this process. When set, the application creates a pid file
     * and checks during startup whether it is not already running. The value can be overruled
     * with the `pid-file-prefix` command-line argument and the `PID_FILE_PREFIX` environment variable, both of which
     * can be set to `none` to disable the pidFile functionality.
     * @default `'./pid/'`
     */
    pidFilePrefix?: string;

    /**
     * Prefix (including path) of the runFile for this process. When set, the application creates a run file
     * at start up, and automatically stops itself gracefully when the file is no longer present. The value can be overruled
     * with the `run-file-prefix` command-line argument and the `RUN_FILE_PREFIX` environment variable, both of which
     * can be set to `none` to disable the runFile functionality. When not set, the {@link pidFilePrefix} is used as run file prefix.
     */
    runFilePrefix?: string;

    config?: string;
    overrides?: string[];
}

/**
 * Builds an {@link ActorRunner} instance based on configuration settings, command-line
 * arguments and environment variables.
 *
 * Command-line arguments have priority, followed by environment variables, with the provided
 * configuration data as fall-back.
 *
 * **Command-line arguments** must by default be prefixed with `--darlean-`. So, when the documentation
 * mentions a command-line argument `appid`, it must by default be provided as `--darlean-appid`.
 * The value must be provided as after the `=` sign: `--darlean-appid=client03`. When
 * multiple vales are expected, they must be comma-separated.
 *
 * **Environment variables** must by default be prefixed with `DARLEAN_`. So, when the documentation
 * mentions an environment variable `APPID`, it must by default be provided as `DARLEAN_APPID`.
 * When multiple values are expected, they must be comma-separated.
 *
 * The argument and environment variable prefix can be configured in the constructor.
 *
 * @see {@link IApplicationCfg} for an overview of all the available configuration items.
 */
export class ConfigRunnerBuilder {
    private actors: IActorRegistrationOptions<object, IMigrationState>[];
    private overrides: Map<string, string>;
    private appId: string;
    private root: IConfigEnv<IApplicationCfg>;

    constructor(scope?: string) {
        this.actors = [];
        this.overrides = new Map();

        this.root = this.deriveConfig(scope ?? 'darlean');

        this.loadOverrides();
        this.appId = this.root.fetchString('appId') ?? 'app';
    }

    /**
     * Registers an individual actor that must be hosted by the actor runner.
     * @param options The options for the actor.
     * @returns The builder
     */
    public registerActor<T extends object, T2 extends IMigrationState>(
        options: IActorRegistrationOptions<T, T2>
    ): ConfigRunnerBuilder {
        this.actors.push(options as unknown as IActorRegistrationOptions<object, IMigrationState>);
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

    public getAppId(): string {
        return this.appId ?? '';
    }

    public getConfig(): IConfigEnv<IApplicationCfg> {
        return this.root;
    }

    public build(): ActorRunner {
        const appId = this.appId;
        const builder = new ActorRunnerBuilder();

        const runtime = this.root.sub<IApplicationRuntimeCfg>('runtime');

        this.appId = appId;
        const runtimeAppsExplicit = this.root.fetchStringArray('runtimeApps');
        const runtimeApps = runtimeAppsExplicit ?? [appId];
        const allInOne = runtimeAppsExplicit === undefined;
        const implicitRuntime = runtimeAppsExplicit?.includes(appId);
        const runtimeEnabled = runtime.fetchString('enabled') ?? (allInOne || implicitRuntime);

        // Note: This call also registers the default appid's of the actor registry. Do this AFTER
        // the call to configureHostActorRegistry, to ensure that the actor lock is registered with
        // the builder BEFORE the actor registry. Otherwise, we may have problems during deactivate.
        builder.setRuntimeApps(runtimeApps);

        this.configureActors(builder);
        this.configureTransports(builder, allInOne, runtimeApps, appId);

        const runner = builder.build();

        if (runtimeEnabled && !allInOne) {
            this.configureDmbServer(runner, this.root, runtimeApps, appId);
        }

        this.configurePidAndRun(appId, runner);

        return runner;
    }

    protected configureActors(builder: ActorRunnerBuilder) {
        for (const actor of this.actors) {
            builder.registerActor(actor);
        }
    }

    protected configureTransports(builder: ActorRunnerBuilder, allInOne: boolean, runtimeApps: string[], appId: string) {
        const messaging = this.root.sub<IMessagingCfg>('messaging');
        const messagingTransportsExplicit = messaging.fetchStringArray('transports');
        const messagingTransports = messagingTransportsExplicit ?? allInOne ? [] : ['dmb'];
        let transportSet = false;
        if (!allInOne || (messagingTransportsExplicit?.length ?? 0 > 0)) {
            for (const transport of messagingTransports) {
                if (transport === 'dmb') {
                    const dmbClientCfg = messaging.sub<IDmbClientCfg>('dmb');
                    const seedUrls: string[] = [];

                    const hosts = this.deriveHosts(dmbClientCfg, runtimeApps);
                    const offsets = this.derivePortOffsets(hosts);
                    const basePort = dmbClientCfg.fetchNumber('basePort') ?? DMB_BASE_PORT;
                    for (let idx = 0; idx < hosts.length; idx++) {
                        seedUrls.push(hosts[idx] + ':' + (basePort + offsets[idx]).toString());
                    }
                    builder.setRemoteAccess(appId, new NatsTransport(new MultiDeSer(), seedUrls));
                    transportSet = true;
                }
            }
        }

        if (!transportSet) {
            builder.setRemoteAccess(appId, new InProcessTransport(new MultiDeSer()));
        }
    }

    protected configureDmbServer(runner: ActorRunner, config: IConfigEnv<IApplicationCfg>, runtimeApps: string[], appId: string) {
        const messaging = config.sub<IMessagingCfg>('messaging');
        const dmb = messaging.sub<IDmbClientCfg>('dmb');
        const runtime = config.sub<IApplicationRuntimeCfg>('runtime');
        const runtimedmb = runtime.sub<IDmbServerCfg>('dmb');
        const enabled = runtimedmb.fetchBoolean('enabled');
        if (enabled === undefined || enabled === true) {
            const appidx = runtimeApps.indexOf(appId);
            const hosts = this.deriveHosts(dmb, runtimeApps);
            if (appidx >= 0 && appidx < hosts.length) {
                const offsets = this.derivePortOffsets(hosts);
                const basePort = dmb.fetchNumber('basePort') ?? DMB_BASE_PORT;
                const clusterPortBase = runtimedmb.fetchNumber('clusterPortBase') ?? DMB_CLUSTER_PORT_BASE;
                const clusterSeeds: string[] = [];
                for (let idx = 0; idx < hosts.length; idx++) {
                    clusterSeeds.push('nats://' + hosts[idx] + ':' + (clusterPortBase + offsets[idx]).toString());
                }
                const clusterListenUrl = 'nats://' + hosts[appidx] + ':' + (clusterPortBase + offsets[appidx]).toString();
                const serverListenPort = basePort + offsets[appidx];

                const server = new NatsServer(
                    (stderr) => {
                        notifier().error(
                            'io.darlean.dmbserver.Stopped',
                            'DMB NATS server[AppId] suddenly stopped: [Error]',
                            () => ({ AppId: appId, Error: stderr })
                        );
                    },
                    serverListenPort,
                    clusterSeeds,
                    clusterListenUrl,
                    appId
                );

                runner.addStarter(
                    async () => {
                        notifier().info('io.darlean.dmbserver.Starting', 'Starting DMB NATS server [AppId]...', () => ({
                            AppId: appId
                        }));
                        server.start();
                        await sleep(2000);
                        notifier().info('io.darlean.dmbserver.Running', 'DMB NATS server [AppId] is running.', () => ({
                            AppId: appId
                        }));
                    },
                    20,
                    'DMB NATS server'
                );

                runner.addStopper(
                    async () => {
                        server.stop();
                        await sleep(2000);
                    },
                    20,
                    'DMB NATS server'
                );
            } else {
                if (enabled === true) {
                    throw new Error('DMB-server is set to enabled, but current app-id is not in the list of runtime-apps.');
                }
            }
        }
    }

    protected configurePidAndRun(appId: string, runner: ActorRunner) {
        let pidFilePrefix = this.root.fetchString('pidFilePrefix') ?? './pid/';
        if (pidFilePrefix === 'none') {
            pidFilePrefix = '';
        }
        let runFilePrefix = this.root.fetchString('runFilePrefix') ?? pidFilePrefix;
        if (runFilePrefix === 'none') {
            runFilePrefix = '';
        }

        const pid = process.pid.toString();

        if (pidFilePrefix) {
            const pidFile = pidFilePrefix + makeNice(appId) + '.pid';
            const pidFolder = path.dirname(pidFile);
            runner.addStarter(
                async () => {
                    if (fs.existsSync(pidFile)) {
                        throw new Error(
                            `Not allowed to start: another instance of [${appId}] may already be running. Ensure it is stopped and that [${pidFile}] is deleted.`
                        );
                    }
                    fs.mkdirSync(pidFolder, { recursive: true });
                    fs.writeFileSync(pidFile, pid, {});
                },
                10,
                'PID File Check'
            );
            // Do the cleanup in onApplicationStop instead of runner.addStopper, because we also want this cleanup
            // to be performed when the application crashes so heavily that the asynchronous runner stop code is not
            // properly executed.
            onApplicationStop(() => {
                fs.rmSync(pidFile, { force: true });
            });
            runner.addStopper(
                async () => {
                    fs.rmSync(pidFile, { force: true });
                },
                10,
                'PID File Remove'
            );
        }

        if (runFilePrefix) {
            const abort = new AbortController();

            const runFile = runFilePrefix + makeNice(appId) + '.run';
            const runFolder = path.dirname(runFile);
            runner.addStarter(
                async () => {
                    fs.mkdirSync(runFolder, { recursive: true });
                    fs.writeFileSync(runFile, pid);
                    fs.watch(runFile, { signal: abort.signal }, (eventType) => {
                        if (eventType === 'rename') {
                            console.log('Removal of run-file detected, gracefully stopping the application...');
                            runner.stop();
                        }
                    });

                    // Some file systems (like the one used for Windows Linux Subsystem) do not properly watch files.
                    // As a fall back for the fs.watch (which responds quicker), also do a "polling" watch file
                    // with a larger interval.
                    fs.watchFile(runFile, { interval: 10014 }, (current) => {
                        if (current.mtimeMs === 0) {
                            console.log('Removal of run-file detected, gracefully stopping the application...');
                            runner.stop();
                        }
                    });
                },
                11,
                'Run File Watcher'
            );
            // Do the cleanup in onApplicationStop instead of runner.addStopper, because we also want this cleanup
            // to be performed when the application crashes so heavily that the asynchronous runner stop code is not
            // properly executed.
            // The watching however must be stopped when the runner stops, otherwise the pending eventloop task prevent
            // the onApplicationStop from ever being triggered.
            runner.addStopper(
                async () => {
                    fs.unwatchFile(runFile);
                    abort.abort();
                },
                11,
                'Run File Stop Watching'
            );
            onApplicationStop(() => {
                fs.rmSync(runFile, { force: true });
            });
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

    protected deriveHosts(dmb: IConfigEnv<IDmbClientCfg> | undefined, appIds: string[]) {
        const hostsExplicit = dmb?.fetchStringArray('hosts');
        const hosts = hostsExplicit ?? appIds.map(() => '127.0.0.1');
        return hosts.slice(0, appIds.length);
    }

    protected deriveConfig(scope: string): IConfigEnv<IApplicationCfg> {
        const cfg = new ConfigEnv<IApplicationCfg>(scope, {});
        const path = cfg.fetchString('config');
        if (path) {
            const contents = fs.readFileSync(path, { encoding: 'utf-8' });
            const parsed = json5.parse(contents) as IApplicationCfg;
            return new ConfigEnv<IApplicationCfg>(scope, parsed);
        }

        return new ConfigEnv<IApplicationCfg>(scope, {});
    }

    protected loadOverrides() {
        const overrides = this.root.fetchString('overrides');
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

function makeNice(value: string) {
    // Replaces all characters that are not a-z, A-Z or _ with a -.
    return value.replace(/(\W+)/gi, '-');
}
