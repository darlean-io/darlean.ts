/**
 * Suite that provides the generic Persistency Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, PERSISTENCE_SERVICE as baseService } from '@darlean/base';
import { IPersistenceServiceOptions, PersistenceService } from './service.impl';

export const PERSISTENCE_SERVICE = baseService;
export * from './service.impl';

export interface IPersistenceService {
    store(options: IPersistenceStoreOptions): Promise<void>;
    load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult>;
    query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult>;
}

export interface IPersistenceStoreOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKey?: string[];
    value?: Buffer;
    version?: string;
}

export interface IPersistenceLoadOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKey?: string[];
}

export interface IPersistenceLoadResult {
    value?: Buffer;
    version?: string;
}

export interface IPersistenceQueryOptions {
    specifiers?: string[];
    partitionKey: string[];
    sortKey?: string[];
    sortKeyOperator?: 'equals' | 'starts-with' | 'less-than' | 'less-than-equal' | 'greater-than' | 'greater-than-equal';
    sortKeyOrder?: 'ascending' | 'descending';
    maxItems?: number;
    continuationToken?: unknown;
}

export interface IQueryItem {
    sortKey: string[];
    value?: Buffer;
}

export interface IPersistenceQueryResult {
    continuationToken?: unknown;
    items: IQueryItem[];
}

export default function suite(options: IPersistenceServiceOptions) {
    return new ActorSuite([
        {
            type: PERSISTENCE_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                return new PersistenceService(options, context.portal);
            }
        }
    ]);
}
