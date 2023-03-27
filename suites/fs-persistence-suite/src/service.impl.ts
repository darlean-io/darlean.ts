import {
    action,
    IActivatable,
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult,
    IPersistenceService,
    IPersistenceStoreBatchOptions,
    IPersistenceStoreBatchResult,
    IPersistenceStoreOptions,
    ITypedPortal,
    toApplicationError
} from '@darlean/base';
import { FsPersistenceActor } from './syncactor.impl';
import * as crypto from 'crypto';

export interface IFsPersistenceServiceOptions {
    shardCount: number;
    nodes: string[];
}

export class FsPersistenceService implements IPersistenceService, IActivatable {
    private shards: { node: string; id: string[]; actor: FsPersistenceActor }[];

    constructor(options: IFsPersistenceServiceOptions, actorPortal: ITypedPortal<FsPersistenceActor>) {
        this.shards = [];

        for (let i = 0; i < options.shardCount; i++) {
            const nodeIdx = i % options.nodes.length;
            const node = options.nodes[nodeIdx];
            const id = [i.toString(), node || ''];

            this.shards.push({
                id,
                node,
                actor: actorPortal.retrieve(id)
            });
        }
    }

    public async activate(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const shard of this.shards) {
            promises.push(shard.actor.touch());
        }
        await Promise.all(promises);
    }

    @action({ locking: 'shared' })
    public store(options: IPersistenceStoreOptions): Promise<void> {
        const shardIdx = this.deriveShardIdx(options.partitionKey);
        const shard = this.shards[shardIdx];
        return shard.actor.store(options);
    }

    @action({ locking: 'shared' })
    public async storeBatch(options: IPersistenceStoreBatchOptions): Promise<IPersistenceStoreBatchResult> {
        const results: IPersistenceStoreBatchResult = { unprocessedItems: [] };
        const shardBatches: Map<number, IPersistenceStoreBatchOptions> = new Map();
        for (const item of options.items) {
            const shardIdx = this.deriveShardIdx(item.partitionKey);
            let sb = shardBatches.get(shardIdx);
            if (!sb) {
                sb = { items: [] };
                shardBatches.set(shardIdx, sb);
            }
            sb.items.push(item);
        }

        // TODO: In Parallel
        // TODO: Ensure eventual consistence by putting items in queue first
        for (const [shardIdx, batch] of shardBatches.entries()) {
            const shard = this.shards[shardIdx];
            try {
                await shard.actor.storeBatch(batch);
            } catch (e) {
                for (const item of batch.items) {
                    results.unprocessedItems.push({ identifier: item.identifier, error: toApplicationError(e) });
                }
            }
        }
        return results;
    }

    @action({ locking: 'shared' })
    public load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const shardIdx = this.deriveShardIdx(options.partitionKey);
        const shard = this.shards[shardIdx];
        return shard.actor.load(options);
    }

    @action({ locking: 'shared' })
    public query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult<Buffer>> {
        const shardIdx = this.deriveShardIdx(options.partitionKey);
        const shard = this.shards[shardIdx];
        return shard.actor.query(options);
    }

    protected deriveShardIdx(partitionKey: string[]): number {
        const hash = crypto.createHash('sha1');
        for (const part of partitionKey as string[]) {
            hash.update(part, 'utf8');
        }
        const offset = hash.digest().readUInt16BE() % this.shards.length;
        return offset;
    }
}
