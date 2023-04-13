/**
 * Suite that provides a minimal set of Runtime Suites.
 * 
 * ## Supported underlying suites
 * 
 * The suite provides the following underlying suites:
 * * {@link @darlean/actor-lock-suite}
 * * {@link @darlean/actor-registry-suite}
 * * {@link @darlean/persistence-suite}
 * * {@link @darlean/fs-persistence-suite}
 *
 * ## Configuration
 * Assuming that the `config` provided to {@link createActorLockSuiteFromConfig} function has `darlean` as its scope, the following config options
 * are understood by this suite:
 * * `darlean.appId` - Optional application id.
 * * `darlean.runtimeApps` - List of application id's of runtime apps
 * * `darlean.runtime.enabled` - Indicates whether the runtime functionality is forcibly enabled or disabled. 
 *    Even when disabled, underlying suites are created and activated when their `enabled` flag is `true`. When
 *    not present, runtime functionality is considered enabled when there are no explicit runtime apps configured, or
 *    when the application id is in the list of explicitly configured runtime-apps. 
 * * `darlean.runtime.actorLock.*` - See {@link @darlean/actor-lock-suite}
 * * `darlean.runtime.actorRegistry.*` - See {@link @darlean/actor-registry-suite}
 * * `darlean.runtime.persistence.*` - See {@link @darlean/persistence-suite}
 * * `darlean.runtime.fsPersistence.*` - See {@link @darlean/fs-persistence-suite}
 * 
 * @packageDocumentation
 */

import { createActorLockSuiteFromConfig, IActorLockCfg } from '@darlean/actor-lock-suite';
import { createActorRegistrySuiteFromConfig, IActorRegistryCfg } from '@darlean/actor-registry-suite';
import { ActorSuite } from '@darlean/base';
import { createPersistenceSuiteFromConfig, IPersistenceCfg } from '@darlean/persistence-suite';
import { IConfigEnv } from '@darlean/utils';
import { createFsPersistenceSuiteFromConfig, IFileSystemPersistenceCfg } from '../../fs-persistence-suite/lib';

/**
 * Root configuration object for the configuration of a Darlean application with only those fields
 * that are used by this runtime suite.
 */
export interface IRuntimeApplicationCfg {
    /**
     * List of application id's that together provide the runtime of the Darlean cluster
     * (that is, provide the actor registry and actor lock, and optionally provide the
     * Darlean Message Bus, persistence and other services).
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
     * Enables or disables the provided runtime functionalities.
     * @default By default, the runtime functionality is enabled when the app-id is in the list
     * of runtime-apps, and disabled otherwise.
     */
    enabled?: boolean;

    /**
     * Configuration of generic persistence.
     */
    persistence?: IPersistenceCfg;


    /**
     * Configuration of file system persistence.
     */
    fsPersistence?: IFileSystemPersistenceCfg;

    /**
     * Configuration of the actor lock.
     */
    actorLock?: IActorLockCfg;

    /**
     * Configuration of the actor registry.
     */
    actorRegistry?: IActorRegistryCfg;
}

/**
 * Creates a runtime suite based on configuration.
 * 
 * Invokes the `*FromConfig` suite creator functions for each of the underlying suites.
 * 
 * @param config The configuration for this application.
 * @param appId The app-id of this application. Used as fallback when no explicit app-id is configured.
 */
export function createRuntimeSuiteFromConfig(config: IConfigEnv<IRuntimeApplicationCfg>, appId: string) {
    const runtime = config.sub<IRuntimeRuntimeCfg>('runtime');
    const runtimeAppsExplicit = config.fetchStringArray('runtimeApps');
    const runtimeApps = runtimeAppsExplicit ?? [appId];
    const allInOne = runtimeAppsExplicit === undefined;

    const implicitRuntime = runtimeAppsExplicit?.includes(appId);
    const runtimeEnabled = runtime.fetchBoolean('enabled') ?? (allInOne || implicitRuntime) ?? false;

    const suite = new ActorSuite();

    suite.addSuite(createActorLockSuiteFromConfig(runtime.sub('actorLock'), runtimeEnabled, runtimeApps));
    suite.addSuite(createActorRegistrySuiteFromConfig(runtime.sub('actorRegistry'), runtimeEnabled, runtimeApps));
    suite.addSuite(createPersistenceSuiteFromConfig(runtime.sub<IPersistenceCfg>('persistence'), runtimeEnabled));
    suite.addSuite(createFsPersistenceSuiteFromConfig(runtime.sub('fsPersistence'), runtimeEnabled));

    return suite;
}

/**
 * Signature of a builder that provides a config and an app-id. This signature matches with the signature of {@link ConfigRunnerBuilder} from
 * package {@link @darlean/core}, so that a ConfigRunnerBuilder instance can be passed as builder to @{link createRuntimeSuiteFromBuilder}.
 */
export interface IBuilder {
    getConfig(): IConfigEnv<IRuntimeApplicationCfg>;
    getAppId(): string;
}

/**
 * Convenience wrapper around {@link createRuntimeSuiteFromConfig} that uses an {@link IBuilder} (for example, an instance of {@link ConfigRunnerBuilder})
 * to derive the config and app-id from.
 */
export function createRuntimeSuiteFromBuilder(builder: IBuilder) {
    return createRuntimeSuiteFromConfig(builder.getConfig(), builder.getAppId());
}
