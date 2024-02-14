import {
    FRAMEWORK_ERROR_MIGRATION_ERROR,
    FrameworkError,
    IMigrationContext,
    IMigrationDefinition,
    IMigrationState,
    IPersistable,
    FRAMEWORK_ERROR_PARAMETER_MIGRATION_VERSION
} from '@darlean/base';
import { encodeNumber, notifier } from '@darlean/utils';

export interface IMigrationController<T extends IMigrationState, Context = undefined> {
    checkCompatibility(persistable: IPersistable<unknown>): Promise<string | undefined>;
    getContext(c: Context): IMigrationContext<T, Context>;
    enforceMigrationInfoOnState(state: IMigrationState): boolean;
    extractMigrationInfo(value: IMigrationState | undefined): string | undefined;
}

export class MigrationController<T extends IMigrationState, Context = undefined> {
    constructor(private migrations: IMigrationDefinition<IMigrationState, Context>[]) {}

    /**
     * Loads the provided persistable and checks whether the known list of migrations supports
     * the persistable's migration state.
     * @param persistable
     */
    public async checkCompatibility(persistable: IPersistable<unknown>) {
        const stateValue = await persistable.load();
        const isNewState = stateValue === undefined;
        if (isNewState) {
            return;
        }

        const info = this.extractMigrationInfo(stateValue as IMigrationState);
        if (!info) {
            return;
        }

        const stateVersion = this.extractMigrationVersion(info);
        const stateVersionMajor = this.extractMajor(stateVersion);
        const supportedVersion = this.obtainLatestSupportedVersion();
        const supportedVersionMajor = this.extractMajor(supportedVersion);

        if (supportedVersionMajor < stateVersionMajor) {
            throw new FrameworkError(
                FRAMEWORK_ERROR_MIGRATION_ERROR,
                'Internal state reports version [StateVersion] which is incompatible with the current software which supports up to version [SupportedVersion]',
                {
                    [FRAMEWORK_ERROR_PARAMETER_MIGRATION_VERSION]: encodeNumber(stateVersionMajor),
                    StateVersion: stateVersion,
                    SupportedVersion: supportedVersion
                }
            );
        }

        return info;
    }

    public getContext(c: Context): IMigrationContext<T, Context> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return {
            perform: async function (state, nameResolver, defaultValue) {
                return await self.perform(state, nameResolver, c, defaultValue);
            }
        };
    }

    public enforceMigrationInfo(info: string | undefined, persistable: IPersistable<unknown>) {
        if (!info) {
            return;
        }
        if (!persistable.hasValue()) {
            const state: IMigrationState = {
                migrationInfo: info
            };
            persistable.change(state);
        } else {
            (persistable.getValue() as unknown as IMigrationState).migrationInfo = info;
            persistable.markDirty();
        }
    }

    public enforceMigrationInfoOnState(state: IMigrationState): boolean {
        // Only set the state when it was not present yet. This avoids issues durihg mmigration when
        // the migration framework sets an explicit version less than the latest supported version.
        if (!state.migrationInfo) {
            const encoded = this.encodeMigrationVersion(this.obtainLatestSupportedVersion());
            if (typeof state !== 'object') {
                return false;
            }
            state.migrationInfo = encoded;
            return true;
        }
        return false;
    }

    public extractMigrationInfo(value: IMigrationState | undefined): string | undefined {
        return value ? (value as IMigrationState).migrationInfo : undefined;
    }

    public extractMigrationVersion(info: string | undefined) {
        if (info) {
            return info.split(';')[0];
        }
    }

    public encodeMigrationVersion(version: string): string {
        return version;
    }

    private obtainLatestSupportedVersion() {
        return this.migrations?.[this.migrations.length - 1]?.version;
    }

    private async perform(
        persistable: IPersistable<T>,
        nameResolver: () => Promise<string>,
        context: Context,
        defaultValue: T
    ): Promise<Context> {
        const stateValue = await persistable.load();
        const isNewState = stateValue === undefined;
        if (isNewState) {
            const supportedVersion = this.migrations?.[this.migrations.length - 1]?.version;
            const state = { ...defaultValue };
            state.migrationInfo = supportedVersion;
            persistable.change(state);
            return context;
        }

        const info = this.extractMigrationInfo(stateValue);
        let stateVersion = this.extractMigrationVersion(info);
        const stateVersionMajor = this.extractMajor(stateVersion);
        const supportedVersion = this.migrations?.[this.migrations.length - 1]?.version;
        const supportedVersionMajor = this.extractMajor(supportedVersion);

        if (supportedVersionMajor < stateVersionMajor) {
            throw new FrameworkError(
                FRAMEWORK_ERROR_MIGRATION_ERROR,
                'Internal state reports version [StateVersion] which is incompatible with the current software which supports up to version [SupportedVersion]',
                {
                    [FRAMEWORK_ERROR_PARAMETER_MIGRATION_VERSION]: encodeNumber(stateVersionMajor),
                    StateVersion: stateVersion,
                    SupportedVersion: supportedVersion
                }
            );
        }

        let name: string | undefined;

        let c = context;
        for (const migration of this.migrations) {
            if (this.secondVersionIsNewerOrEqual(migration.version, stateVersion ?? '')) {
                continue;
            }

            if (name === undefined) {
                name = await nameResolver();
            }

            notifier().info('MIGRATION_STARTED', 'Started migration [MigrationVersion] ([MigrationName]) for [Subject]', () => ({
                MigrationVersion: migration.version,
                MigrationName: migration.name,
                Subject: name
            }));
            try {
                c = (await migration.migrator(persistable, c)) ?? c;

                this.enforceMigrationInfo(this.encodeMigrationVersion(migration.version), persistable);
                await persistable.persist('always');
                stateVersion = migration.version;
                notifier().info(
                    'MIGRATION_FINISHED',
                    'Finished migration [MigrationVersion] ([MigrationName]) for [Subject]',
                    () => ({
                        MigrationVersion: migration.version,
                        MigrationName: migration.name,
                        Subject: name
                    })
                );
            } catch (e) {
                notifier().error(
                    'MIGRATION_FAILED',
                    'Failed migration [MigrationVersion] [MigrationName] for [Subject]: [Error]',
                    () => ({
                        MigrationVersion: migration.version,
                        MigrationName: migration.name,
                        Subject: name,
                        Error: e
                    })
                );
                throw e;
            }
        }

        return c;
    }

    private secondVersionIsNewerOrEqual(first: string, second: string) {
        const firstNormalized = this.normalizeVersion(first)
            .map((x) => x.toString().padStart(10, '0'))
            .join('.');
        const secondNormalized = this.normalizeVersion(second)
            .map((x) => x.toString().padStart(10, '0'))
            .join('.');
        return secondNormalized >= firstNormalized;
    }

    private extractMajor(version: string | undefined) {
        if (!version) {
            return 0;
        }
        return parseInt(version.split('.')[0]);
    }

    private normalizeVersion(v: string) {
        let parts = v.split('.').map((x) => (x === '' ? 0 : parseInt(x)));
        while (parts[parts.length] === 0) {
            parts = parts.slice(0, parts.length - 1);
        }
        return parts;
    }
}
