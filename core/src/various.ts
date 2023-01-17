/* eslint-disable @typescript-eslint/ban-types */
import { IPersistable, IPersistence } from '@darlean/base';
import { replaceAll } from '@darlean/utils';

class MemoryPersistable<T> implements IPersistable<T> {
    private _changed = false;
    private persistence: MemoryPersistence<T>;
    private partitionKey: string[] | undefined;
    private sortKey: string[] | undefined;

    public value?: T | undefined;
    public version?: string | undefined;
    
    constructor(persistence: MemoryPersistence<T>, partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined) {
        this.persistence = persistence;
        this.partitionKey = partitionKey;
        this.sortKey = sortKey;
        this.value = value;
    }

    public async load(): Promise<T | undefined> {
        const result = await this.persistence.loadImpl(this.partitionKey, this.sortKey);
        if (result[0] !== undefined) {
            this.value = result[0];
        }
        this.version = result[1];
        this._changed = false;
        return result[0];
    }

    public async store(force?: boolean): Promise<void> {
        if (!force) {
            if (!this._changed) {
                return;
            }
        }
        
        if (this._changed) {
            if (this.version) {
                const next = parseInt(this.version || '0') + 1;
                this.version = next.toString().padStart(20, '0');
            } else {
                const next = Date.now();
                this.version = next.toString().padStart(20, '0');    
            }
        }
        await this.persistence.storeImpl(this.partitionKey, this.sortKey, this.value, this.version);
        this._changed = false;
    }

    public change(value: T | undefined): void {
        this.value = value;
        this._changed = true;
    }

    changed(): boolean {
        return this._changed;
    }
}


export class MemoryPersistence<T> implements IPersistence<T> {
    protected values: Map<string, Map<string, unknown>>;

    constructor() {
        this.values = new Map();
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        return new MemoryPersistable(this, partitionKey, sortKey, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>> {
        const p = this.persistable(partitionKey, sortKey, undefined);
        await p.load();
        return p;
    }

    public async loadImpl(partitionKey?: string[], sortKey?: string[]): Promise<[value: T | undefined, version: string | undefined]> {
        const pkey = idToText(partitionKey || []);
        const p = this.values.get(pkey);
        if (p) {
            const skey = idToText(sortKey || []);
            return [p.get(skey) as T, undefined];
        }
        return [undefined, undefined];
    }

    public async storeImpl(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined, _version: string | undefined): Promise<void> {
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

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        const keys = this.deriveKeys(partitionKey, sortKey);
        return this.superPersistence.persistable(keys.pk, keys.sk, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>> {
        const p = this.persistable(partitionKey, sortKey, undefined);
        await p.load();
        return p;
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
