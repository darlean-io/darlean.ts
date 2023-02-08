export interface IHandlerCfg {
    path?: string;
    method?: string;
    actorType?: string;
    actorId?: string[];
    actionName?: string;
    placeholders?: string[];
}

export interface IHostCfg {
    id?: string;
    port?: number;
    handlers?: IHandlerCfg[];
    actorType?: string;
    actorId?: string[];
}

export interface IWebServiceCfg {
    hosts?: IHostCfg[];
}
