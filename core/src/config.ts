export interface IPersistenceSpecifierCfg {
    specifier: string;
    compartment: string;
}

export interface IPersistenceHandlerCfg {
    compartment: string;
    actorType: string;
}

export interface IFileSystemCompartmentCfg {
    compartment: string;
    partitionKeyLen?: number;
    sortKeyLen?: number;
    shardCount?: number;
    nodes?: string[];
    basePath: string;
}

export interface IFileSystemPersistenceCfg {
    compartments: IFileSystemCompartmentCfg[];
}

export interface IPersistenceCfg {
    specifiers: IPersistenceSpecifierCfg[];
    handlers: IPersistenceHandlerCfg[];
    fs: IFileSystemPersistenceCfg;
}
