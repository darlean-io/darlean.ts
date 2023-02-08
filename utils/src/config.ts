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
