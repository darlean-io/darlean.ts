export interface IGatewayFlowCfg {
    action: 'continue' | 'break';
    statusCode?: number;
    statusMessage?: string;
}

export interface IGatewayHandlerCfg {
    path?: string;
    method?: string;
    actorType?: string;
    actorId?: string[];
    actionName?: string;
    placeholders?: string[];
    flow?: IGatewayFlowCfg;
}

export interface IGatewayCfg {
    id?: string;
    port?: number;
    handlers?: IGatewayHandlerCfg[];
    actorType?: string;
    actorId?: string[];
}

export interface IWebGatewaysCfg {
    enabled?: boolean;
    gateways?: IGatewayCfg[];
    // Port for the first gateway
    port?: number;
}
