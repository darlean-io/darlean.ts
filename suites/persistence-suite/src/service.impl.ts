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
import { replaceAll, wildcardMatch } from '@darlean/utils';

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
    options: IPersistenceStoreOptions;
    resolve: () => void;
    reject: (err: unknown) => void;
}

export class PersistenceService implements IPersistenceService {
    protected options: IPersistenceServiceOptions;
    protected portal: IPortal;
    protected batched: IBatchedItem[];
    protected scheduled = false;

    constructor(options: IPersistenceServiceOptions, portal: IPortal) {
        this.options = options;
        this.portal = portal;
        this.batched = [];
    }

    @action({ locking: 'shared' })
    public store(options: IPersistenceStoreOptions): Promise<void> {
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
        /*
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return p.store(options);
        */
    }

    @action({ locking: 'shared' })
    public storeBatch(options: IPersistenceStoreBatchOptions): Promise<IPersistenceStoreBatchResult> {
        return this.storeBatchImpl(options);
    }

    @action({ locking: 'shared' })
    public load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return p.load(options);
    }

    @action({ locking: 'shared' })
    public query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>> {
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return p.query(options);
    }

    protected async storeBatchImpl(options: IPersistenceStoreBatchOptions): Promise<IPersistenceStoreBatchResult> {
        const results: IPersistenceStoreBatchResult = { unprocessedItems: [] };

        const batches: Map<string, IPersistenceStoreBatchOptions> = new Map();
        for (const item of options.items) {
            const compartment = this.deriveCompartment(item.specifiers || []);
            let b: IPersistenceStoreBatchOptions | undefined = batches.get(compartment);
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
            let limitedBatch: IPersistenceStoreBatchOptions = { items: [] };
            let limitedLength = 0;
            for (const item of batch.items) {
                const itemSize = item.value?.length ?? 0;
                if (limitedLength + itemSize > MAX_BATCH_SIZE) {
                    const result = await p.storeBatch(limitedBatch);
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
                const result = await p.storeBatch(limitedBatch);
                for (const unprocessed of result.unprocessedItems) {
                    results.unprocessedItems.push(unprocessed);
                }
            }
        }

        return results;
    }

    protected deriveCompartment(specifiers: string[]): string {
        for (const specifier of specifiers) {
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
        }

        throw new ApplicationError('NO_COMPARTMENT', 'No compartment could be derived for specifiers [Specifiers]', {
            Specifiers: specifiers
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
