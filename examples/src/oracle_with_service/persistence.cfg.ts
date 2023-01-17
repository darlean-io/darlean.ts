import { IFsPersistenceOptions } from '@darlean/fs-persistence-suite';

export const persistenceConfig: IFsPersistenceOptions = {
    compartments: [
        {
            filter: '*',
            basePath: './persistence/',
            shardCount: 1
        }
    ]
};
