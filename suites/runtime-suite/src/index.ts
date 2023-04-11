/**
 * Suite that provides a minimal set of Runtime Suites.
 *
 * @packageDocumentation
 */

import { createActorLockSuiteFromConfig, IActorLockCfg } from '@darlean/actor-lock-suite';
import { createActorRegistrySuiteFromConfig, IActorRegistryCfg } from '@darlean/actor-registry-suite';
import { ActorSuite } from '@darlean/base';
import { createPersistenceSuiteFromConfig, IPersistenceCfg } from '@darlean/persistence-suite';
import { IConfigEnv } from '@darlean/utils';
import { createFsPersistenceSuiteFromConfig } from '../../fs-persistence-suite/lib';

/**
 * Root configuration object for the configuration of a Darlean application.
 *
 * Many of the settings can be overruled by command-line arguments or environment variables. See
 * {@link ConfigRunnerBuilder} for more details.
 */
export interface IRuntimeApplicationCfg {
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
    runtime?: IRuntimeRuntimeCfg;
}

/**
 * Configuration for when this application acts as a runtime application.
 */
export interface IRuntimeRuntimeCfg {
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
}

export function createRuntimeSuiteFromConfig(root: IConfigEnv<IRuntimeApplicationCfg>, appId: string) {
    const runtime = root.sub<IRuntimeRuntimeCfg>('runtime');
    const runtimeAppsExplicit = root.fetchStringArray('runtimeApps');
    const runtimeApps = runtimeAppsExplicit ?? [appId];
    const allInOne = runtimeAppsExplicit === undefined;

    const implicitRuntime = runtimeAppsExplicit?.includes(appId);
    const runtimeEnabled = runtime.fetchString('enabled') ?? (allInOne || implicitRuntime);

    const suite = new ActorSuite();

    // Note: We first configure/register the actor lock, before registering the actor registry (and others),
    // because the deactivate happens in reverse order and actor registry needs actor lock.
    if (runtimeEnabled) {
        const persistence = runtime.sub<IPersistenceCfg>('persistence');

        suite.addSuite(createActorLockSuiteFromConfig(persistence.sub('actorLock'), runtimeApps));
        suite.addSuite(createActorRegistrySuiteFromConfig(persistence.sub('actorRegistry'), runtimeApps));
        suite.addSuite(createPersistenceSuiteFromConfig(persistence));
        suite.addSuite(createFsPersistenceSuiteFromConfig(persistence.sub('fs')));
    }
    return suite;
}

export interface IBuilder {
    getConfig(): IConfigEnv<IRuntimeApplicationCfg>;
    getAppId(): string;
}

export function createRuntimeSuiteFromBuilder(builder: IBuilder) {
    return createRuntimeSuiteFromConfig(builder.getConfig(), builder.getAppId());
}
