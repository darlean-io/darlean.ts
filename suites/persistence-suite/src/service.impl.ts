import {
    action,
    ApplicationError,
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceService,
    IPersistenceStoreBatchOptions,
    IPersistenceStoreBatchResult,
    IPersistenceStoreOptions,
    IPortal
} from '@darlean/base';
import { BufferOf, IDeSer, replaceAll, wildcardMatch } from '@darlean/utils';

const MAX_BATCH_SIZE = 500000;

export interface IPersistenceMapping {
    specifier: string;
    compartment: string;
}

export interface IPersistenceHandler {
    compartment: string;
    actorType: string;
}

export interface IPersistenceServiceOptions {
    compartments: IPersistenceMapping[];
    handlers: IPersistenceHandler[];
}

interface IBatchedItem {
    options: IPersistenceStoreOptions<Buffer>;
    resolve: () => void;
    reject: (err: unknown) => void;
}

export class PersistenceService implements IPersistenceService {
    protected options: IPersistenceServiceOptions;
    protected portal: IPortal;
    protected batched: IBatchedItem[];
    protected scheduled = false;

    constructor(options: IPersistenceServiceOptions, portal: IPortal, private deser: IDeSer) {
        this.options = options;
        this.portal = portal;
        this.batched = [];
    }

    @action({ locking: 'shared' })
    public store(options: IPersistenceStoreOptions<Buffer>): Promise<void> {
        return new Promise((resolve, reject) => {
            this.batched.push({ options, resolve, reject });
            if (!this.scheduled) {
                this.scheduled = true;
                setImmediate(async () => {
                    const batched = this.batched;
                    this.batched = [];
                    this.scheduled = false;
                    try {
                        const items = batched.map((x, index) => ({ ...x.options, identifier: index }));
                        const results = await this.storeBatchImpl({ items });

                        for (const item of results.unprocessedItems) {
                            batched[item.identifier as number].reject(item.error);
                        }

                        for (const item of batched) {
                            item.resolve();
                        }
                    } catch (e) {
                        for (const item of batched) {
                            item.reject(e);
                        }
                    }
                });
            }
        });
    }

    @action({ locking: 'shared' })
    public storeBatch(options: IPersistenceStoreBatchOptions<Buffer>): Promise<IPersistenceStoreBatchResult> {
        return this.storeBatchImpl(options);
    }

    @action({ locking: 'shared' })
    public async storeBatchBuffer(options: BufferOf<IPersistenceStoreBatchOptions<Buffer>>): Promise<BufferOf<IPersistenceStoreBatchResult>> {
        return this.deser.serialize(await this.storeBatchImpl(this.deser.deserializeTyped(options)));
    }

    @action({ locking: 'shared' })
    public load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult<Buffer>> {
        const compartment = this.deriveCompartment(options.specifier || '');
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return p.load(options);
    }

    @action({ locking: 'shared' })
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>> {
        const results = await this.queryBufferImpl(options);
        return this.deser.deserializeTyped(results);
    }

    @action({ locking: 'shared' })
    public queryBuffer(options: IPersistenceQueryOptions): Promise<BufferOf<IPersistenceQueryResult<Buffer>>> {
        return this.queryBufferImpl(options);
    }

    protected async queryBufferImpl(options: IPersistenceQueryOptions): Promise<BufferOf<IPersistenceQueryResult<Buffer>>> {
        const compartment = this.deriveCompartment(options.specifier || '');
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return p.queryBuffer(options);
    }

    protected async storeBatchImpl(options: IPersistenceStoreBatchOptions<Buffer>): Promise<IPersistenceStoreBatchResult> {
        const results: IPersistenceStoreBatchResult = { unprocessedItems: [] };

        const batches: Map<string, IPersistenceStoreBatchOptions<Buffer>> = new Map();
        for (const item of options.items) {
            const compartment = this.deriveCompartment(item.specifier || '');
            let b: IPersistenceStoreBatchOptions<Buffer> | undefined = batches.get(compartment);
            if (!b) {
                b = { items: [] };
                batches.set(compartment, b);
            }
            b.items.push(item);
        }

        // TODO: Ensure eventual persistence by storing batches in a queue first
        // TODO: Process in parallel
        for (const [compartment, batch] of batches.entries()) {
            const handler = this.deriveHandler(compartment);
            const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
            let limitedBatch: IPersistenceStoreBatchOptions<Buffer> = { items: [] };
            let limitedLength = 0;
            for (const item of batch.items) {
                const itemSize = item.value?.length ?? 0;
                if (limitedLength + itemSize > MAX_BATCH_SIZE) {
                    const result = this.deser.deserializeTyped(await p.storeBatchBuffer(this.deser.serialize(limitedBatch)));
                    for (const unprocessed of result.unprocessedItems) {
                        results.unprocessedItems.push(unprocessed);
                    }
                    limitedBatch = { items: [item] };
                    limitedLength = 0;
                } else {
                    limitedBatch.items.push(item);
                }
            }
            if (limitedBatch.items.length > 0) {
                const result = this.deser.deserializeTyped(await p.storeBatchBuffer(this.deser.serialize(limitedBatch)));
                for (const unprocessed of result.unprocessedItems) {
                    results.unprocessedItems.push(unprocessed);
                }
            }
        }

        return results;
    }

    protected deriveCompartment(specifier: string): string {
        for (const mapping of this.options.compartments) {
            const fields: string[] = [];
            if (wildcardMatch(specifier, mapping.specifier, fields)) {
                let compartment = mapping.compartment;
                for (let idx = 0; idx < 10; idx++) {
                    const pattern = ''.padEnd(idx, '*');
                    compartment = replaceAll(compartment, '${' + pattern + '}', fields[idx] ?? '');
                }
                return compartment;
            }
        }

        throw new ApplicationError('NO_COMPARTMENT', 'No compartment could be derived for specifier [Specifier]', {
            Specifier: specifier
        });
    }

    protected deriveHandler(compartment: string): IPersistenceHandler {
        for (const handler of this.options.handlers) {
            if (wildcardMatch(compartment, handler.compartment)) {
                return handler;
            }
        }

        throw new ApplicationError('NO_HANDLER', 'No handler could be derived for compartment [Compartment]', {
            Compartment: compartment
        });
    }
}
