import { action, IActivatable, IPersistenceLoadOptions, IPersistenceLoadResult, IPersistenceQueryOptions, IPersistenceQueryResult, IPersistenceService, IPersistenceStoreOptions, ITypedPortal } from '@darlean/base';
import { FsPersistenceActor } from './actor.impl';
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
        for (const shard of this.shards) {
            await shard.actor.touch();
        }
    }

    @action()
    public async store(options: IPersistenceStoreOptions): Promise<void> {
        const shardIdx = this.deriveShardIdx(options.partitionKey);
        const shard = this.shards[shardIdx];
        await shard.actor.store(options);
    }

    @action()
    public async load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const shardIdx = this.deriveShardIdx(options.partitionKey);
        const shard = this.shards[shardIdx];
        return await shard.actor.load(options);
    }

    @action()
    public async query(_options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult> {
        throw new Error('Method not implemented.');
    }

    protected deriveShardIdx(partitionKey: string[]): number {
        let offset = 0;
        const hash = crypto.createHash('sha1');
        for (const part of partitionKey as string[]) {
            hash.push(part, 'utf8');
        }
        offset = hash.digest().readUInt16BE() % this.shards.length;
        return offset;
    }
}
