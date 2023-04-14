import { replaceAll } from './util';

export function fetchConfigString(envName: string, argName: string): string | undefined {
    const a = argName;
    const aa = a + '=';
    for (const arg of process.argv) {
        if (arg === a) {
            throw new Error(`Invalid command line argument ${a}: argument must be in the form of ${a}=value`);
        }
        if (arg.startsWith(aa)) {
            const value = arg.substring(aa.length).trim();
            return value;
        }
    }

    const e = envName;
    const v = process.env[e];
    if (v !== undefined) {
        return v;
    }
}

export function fetchConfigNumber(envName: string, argName: string): number | undefined {
    const v = fetchConfigString(envName, argName);
    if (v !== undefined) {
        return parseInt(v);
    }
}

export function fetchConfigBoolean(envName: string, argName: string): boolean | undefined {
    const v = fetchConfigString(envName, argName);
    if (v !== undefined) {
        return v !== 'false';
    }
}

export function fetchConfigArray(envName: string, argName: string): string[] | undefined {
    const v = fetchConfigString(envName, argName);
    if (v !== undefined) {
        if (v.trim() === 'none') {
            return [];
        }
        const parts = v.split(',').map((x) => x.trim());
        return parts;
    }
}

export interface IConfigEnv<T> {
    fetchString(name: keyof T): string | undefined;
    fetchNumber(name: keyof T): number | undefined;
    fetchBoolean(name: keyof T): boolean | undefined;
    fetchStringArray(name: keyof T): string[] | undefined;
    fetchRaw<U extends keyof T>(name: U): T[U] | undefined;
    sub<S>(name: string): IConfigEnv<S>;
}

export class ConfigEnv<T> implements IConfigEnv<T> {
    private scope: string;
    private settings: Map<string, unknown>;

    /**
     *
     * @param scope Dotted-separated string that is prefixed to fetch names.
     * @param settings
     */
    constructor(scope: string, settings: T) {
        this.scope = scope;
        this.settings = new Map();
        for (const [key, value] of Object.entries(settings as { [key: string]: unknown })) {
            this.settings.set(key.toLowerCase(), value);
        }
    }

    public fetchString(name: keyof T): string | undefined {
        const envname = this.toEnvName(name.toString());
        const argname = this.toArgName(name.toString());
        return fetchConfigString(envname, argname) ?? this.fetchStringSetting(name.toString());
    }

    public fetchNumber(name: keyof T): number | undefined {
        const envname = this.toEnvName(name.toString());
        const argname = this.toArgName(name.toString());
        return fetchConfigNumber(envname, argname) ?? this.fetchNumberSetting(name.toString());
    }

    public fetchBoolean(name: keyof T): boolean | undefined {
        const envname = this.toEnvName(name.toString());
        const argname = this.toArgName(name.toString());
        return fetchConfigBoolean(envname, argname) ?? this.fetchBooleanSetting(name.toString());
    }

    public fetchStringArray(name: keyof T): string[] | undefined {
        const envname = this.toEnvName(name.toString());
        const argname = this.toArgName(name.toString());
        return fetchConfigArray(envname, argname) ?? this.fetchStringArraySetting(name.toString());
    }

    public fetchRaw<U extends keyof T>(name: U): T[U] | undefined {
        return this.settings.get(name.toString()) as T[U];
        //return this.fetchRawSetting(name.toString());
    }

    public sub<S>(name: string): IConfigEnv<S> {
        const scope = [this.scope, name].join('.');
        const settings = this.settings.get(name.toLowerCase()) ?? {};
        return new ConfigEnv<S>(scope, settings as S);
    }

    private fetchStringSetting(name: string): string | undefined {
        return this.settings.get(name.toLowerCase())?.toString();
    }

    private fetchNumberSetting(name: string): number | undefined {
        const v = this.fetchStringSetting(name);
        if (v !== undefined) {
            return parseInt(v);
        }
    }

    private fetchBooleanSetting(name: string): boolean | undefined {
        const v = this.fetchStringSetting(name);
        if (v !== undefined) {
            return v !== 'false';
        }
    }

    private fetchStringArraySetting(name: string): string[] | undefined {
        const v = this.fetchStringSetting(name);
        if (v !== undefined) {
            if (Array.isArray(v)) {
                return v;
            }
            if (typeof v === 'string') {
                if (v.trim() === 'none') {
                    return [];
                }
                const parts = v.split(',').map((x) => x.trim());
                return parts;
            }
            throw new Error('Invalid type');
        }
    }

    private fetchRawSetting<T>(name: string): T[] | undefined {
        const v = this.fetchStringSetting(name);
        if (v !== undefined) {
            if (Array.isArray(v)) {
                return v;
            }
            throw new Error('Invalid type');
        }
    }

    private toEnvName(name: string): string {
        return replaceAll(this.scope + '.' + name, '.', '_').toUpperCase();
    }

    private toArgName(name: string): string {
        return replaceAll('--' + this.scope + '.' + name, '.', '-').toLowerCase();
    }
}
