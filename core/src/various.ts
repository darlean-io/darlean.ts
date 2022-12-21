/* eslint-disable @typescript-eslint/ban-types */
import { IPersistence } from '@darlean/base';
import { replaceAll } from '@darlean/utils';

/*

export class LocalPortal implements IPortal {
    protected factories: Map<string, IInstanceFactory<unknown>>;

    constructor() {
        this.factories = new Map();
    }

    public register(type: string, factory: IInstanceFactory<unknown>) {
        this.factories.set(type, factory);
    }

    public retrieve<T extends object>(type: string, id: string[]): T {
        // Return a proxy that on every request, asks the underlying factory for the
        // latest instance. By doing so, the returned object is robust against 
        // intermediate deactivation (it will then point to a newly create instance).
        const instance = {} as T;
        const self = this;
        const p = Proxy.revocable(instance, {
            get: (target, prop, receiver) => {
                return async function() {
                    const f = self.factories.get(type) as IInstanceFactory<T>;
                    if (f) {
                        const i = f.obtain(id);
                        const value = (i as any)[prop] as Function;
                        return await value.apply(i, Array.from(arguments));
                    } else {
                        throw new InvokeError(NOT_REGISTERED);
                    }
                }
            }
        });
        return p.proxy;            
    }
}
*/

export class MemoryPersistence<T> implements IPersistence<T> {
    protected values: Map<string, Map<string, unknown>>;

    constructor() {
        this.values = new Map();
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<T | undefined> {
        const pkey = idToText(partitionKey || []);
        const p = this.values.get(pkey);
        if (p) {
            const skey = idToText(sortKey || []);
            return p.get(skey) as T;
        }
    }

    public async store(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: unknown): Promise<void> {
        const pkey = idToText(partitionKey || []);
        let p = this.values.get(pkey);
        if (!p) {
            p = new Map<string, Map<string, T>>();
            this.values.set(pkey, p);
        }
        const skey = idToText(sortKey || []);
        p.set(skey, value);
    }

    public sub(partitionKey?: string[], sortKey?: string[]): IPersistence<T> {
        return new SubPersistence<T>(this, partitionKey, sortKey);
    }

    public clear() {
        this.values.clear();
    }
}

export class SubPersistence<T> implements IPersistence<T> {
    protected superPersistence: IPersistence<T>;
    protected basePartitionKey: string[];
    protected baseSortKey: string[];

    constructor(superPersistence: IPersistence<T>, basePartitionKey?: string[], baseSortKey?: string[]) {
        this.superPersistence = superPersistence;
        this.basePartitionKey = basePartitionKey || [];
        this.baseSortKey = baseSortKey || [];
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<T | undefined> {
        const keys = this.deriveKeys(partitionKey, sortKey);
        return this.superPersistence.load(keys.pk, keys.sk);
    }

    public async store(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T): Promise<void> {
        const keys = this.deriveKeys(partitionKey, sortKey);
        this.superPersistence.store(keys.pk, keys.sk, value);
    }

    public sub(partitionKey?: string[], sortKey?: string[]): IPersistence<T> {
        const keys = this.deriveKeys(partitionKey, sortKey);
        return new SubPersistence<T>(this, keys.pk, keys.sk);
    }

    protected deriveKeys(partitionKey: string[] | undefined, sortKey: string[] | undefined): { pk: string[]; sk: string[] } {
        if (partitionKey?.length ?? 0 > 0) {
            if (this.baseSortKey.length > 0) {
                throw new Error(`Sub partition key only allowed when there is no base sort key`);
            }
            return { pk: [...this.basePartitionKey, ...(partitionKey ?? [])], sk: sortKey ?? [] };
        } else {
            return { pk: this.basePartitionKey, sk: [...this.baseSortKey, ...(sortKey ?? [])] };
        }
    }
}

export function idToText(id: string[]): string {
    const parts = id.map((v) => {
        v = replaceAll(v, '\u0001', '\u0001\u0001');
        v = replaceAll(v, '\u0000', '\u0001\u0000');
        return v;
    });
    return parts.join('\u0000\u0000');
}

export function idFromText(text: string): string[] {
    const parts = text.split('\u0000\u0000');
    return parts.map((v) => {
        v = replaceAll(v, '\u0001\u0000', '\u0000');
        v = replaceAll(v, '\u0001\u0001', '\u0001');
        return v;
    });
}

export function idToText2(id: string[]): string {
    const content = id.join('');
    const lengths = id.map((v) => v.length).join('@');
    return content + '#' + lengths;
}

export function idFromText2(text: string): string[] {
    const idx = text.lastIndexOf('#');
    const content = text.substring(0, idx);
    const lengths = text.substring(idx + 1).split('@');
    const result = [];
    let offset = 0;
    for (const length of lengths) {
        const len = parseInt(length);
        result.push(content.substring(offset, offset + len));
        offset += len;
    }
    return result;
}
