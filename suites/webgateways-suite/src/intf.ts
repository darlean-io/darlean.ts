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
    /**
     * Keep alive timeout for this web gateway. Overrides the value set by {@link IWebGatewaysCfg.keepAliveTimeout}.
     */
    keepAliveTimeout?: number;
}

export interface IWebGatewaysCfg {
    enabled?: boolean;
    gateways?: IGatewayCfg[];
    // Port for the first gateway
    port?: number;
    /**
     * Default keep alive timeout (in ms) that is used for gateways that do not have an explicit override
     * configured for keepAliveTimeout. The keepAliveTimeout should be longer than the corresponding setting
     * for any reverse-proxy that is in front of the web gateway. Because popular reverse-proxies like nginx and
     * caddy have a default keep-alive-timeout of about 2 minutes, the default value is set to 150.000 ms (150 seconds)
     * which is sufficiently longer to avoid race conditions when the web gateway closes the connection the same time
     * the reverse proxy is trying to make a request.
     */
    keepAliveTimeout?: number;
}
