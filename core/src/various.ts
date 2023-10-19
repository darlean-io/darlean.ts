/* eslint-disable @typescript-eslint/ban-types */
import { CustomPersistable, IPersistable, IPersistence, IPersistenceQueryOptions, IPersistenceQueryResult } from '@darlean/base';
import { replaceAll } from '@darlean/utils';

class MemoryPersistable<T> extends CustomPersistable<T> {
    private persistence: MemoryPersistence<T>;
    private partitionKey: string[] | undefined;
    private sortKey: string[] | undefined;

    public version?: string | undefined;

    constructor(
        persistence: MemoryPersistence<T>,
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined
    ) {
        super(value);
        this.persistence = persistence;
        this.partitionKey = partitionKey;
        this.sortKey = sortKey;
    }

    protected async _load(): Promise<{ value: T | undefined; version: string | undefined }> {
        const result = await this.persistence.loadImpl(this.partitionKey, this.sortKey);
        this.version = result[1];
        return { value: result[0], version: result[1] };
    }

    protected async _persist(value: T | undefined, version: string): Promise<void> {
        await this.persistence.storeImpl(this.partitionKey, this.sortKey, value, version);
    }
}

export class MemoryPersistence<T> implements IPersistence<T> {
    protected values: Map<string, Map<string, unknown>>;

    constructor() {
        this.values = new Map();
    }

    public async query(_options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>> {
        throw new Error('Method not implemented.');
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        return new MemoryPersistable(this, partitionKey, sortKey, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>> {
        const p = this.persistable(partitionKey, sortKey, undefined);
        await p.load();
        return p;
    }

    public async loadImpl(
        partitionKey?: string[],
        sortKey?: string[]
    ): Promise<[value: T | undefined, version: string | undefined]> {
        const pkey = idToText(partitionKey || []);
        const p = this.values.get(pkey);
        if (p) {
            const skey = idToText(sortKey || []);
            return [p.get(skey) as T, undefined];
        }
        return [undefined, undefined];
    }

    public async storeImpl(
        partitionKey: string[] | undefined,
        sortKey: string[] | undefined,
        value: T | undefined,
        _version: string | undefined
    ): Promise<void> {
        const pkey = idToText(partitionKey || []);
        let p = this.values.get(pkey);
        if (!p) {
            p = new Map<string, Map<string, T>>();
            this.values.set(pkey, p);
        }
        const skey = idToText(sortKey || []);
        p.set(skey, value);
    }

    public sub(partitionKey?: string[]): IPersistence<T> {
        return new SubPersistence<T>(this, partitionKey);
    }

    public clear() {
        this.values.clear();
    }
}

export class SubPersistence<T> implements IPersistence<T> {
    protected superPersistence: IPersistence<T>;
    protected basePartitionKey: string[];

    constructor(superPersistence: IPersistence<T>, basePartitionKey?: string[]) {
        this.superPersistence = superPersistence;
        this.basePartitionKey = basePartitionKey || [];
    }

    public query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<T>> {
        const keys = this.deriveKeys(options.partitionKey);
        return this.superPersistence.query({
            partitionKey: keys.pk,
            sortKeyFrom: options.sortKeyFrom,
            sortKeyTo: options.sortKeyTo,
            sortKeyToMatch: options.sortKeyToMatch,
            continuationToken: options.continuationToken,
            maxItems: options.maxItems,
            sortKeyOrder: options.sortKeyOrder,
            specifier: options.specifier
        });
    }

    public persistable(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T | undefined): IPersistable<T> {
        const keys = this.deriveKeys(partitionKey);
        return this.superPersistence.persistable(keys.pk, sortKey, value);
    }

    public async load(partitionKey?: string[], sortKey?: string[]): Promise<IPersistable<T>> {
        const p = this.persistable(partitionKey, sortKey, undefined);
        await p.load();
        return p;
    }

    public sub(partitionKey?: string[]): IPersistence<T> {
        const keys = this.deriveKeys(partitionKey);
        return new SubPersistence<T>(this, keys.pk);
    }

    protected deriveKeys(partitionKey: string[] | undefined) {
        if (partitionKey?.length ?? 0 > 0) {
            return { pk: [...this.basePartitionKey, ...(partitionKey ?? [])] };
        } else {
            return { pk: this.basePartitionKey };
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
