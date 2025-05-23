import { action, IActivatable, IDeactivatable, IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';
import { notifier } from '@darlean/utils';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import url from 'url';
import querystring from 'querystring';
import { IGatewayFlowCfg } from './intf';
import graceful from 'http-graceful-shutdown';
import { PathPrefixMatcher } from './path-prefix-matcher';

const MAX_BODY_LENGTH = 100 * 1000;

export interface IHandler {
    method?: string;
    path?: string;
    action: (req: IWebGatewayRequest) => Promise<IWebGatewayResponse>;
    flow?: IGatewayFlowCfg;
    maxContentLength?: number;
}

export interface IGateway {
    name: string;
    port: number;
    handlers: IHandler[];
    keepAliveTimeout: number;
    maxContentLength?: number;
}

export class WebGatewayActor implements IActivatable, IDeactivatable {
    protected server: Server;
    protected config: IGateway;
    protected port?: number;
    private close: () => Promise<void>;
    private pathMatchers: (PathPrefixMatcher | undefined)[];

    constructor(config: IGateway) {
        this.config = config;
        this.pathMatchers = [];
        for (const handler of this.config.handlers) {
            this.pathMatchers.push(handler.path ? new PathPrefixMatcher(handler.path) : undefined);
        }

        const server = createServer((req, res) => {
            setImmediate(async () => {
                await this.handleRequest(req, res);
            });
        });
        server.keepAliveTimeout = config.keepAliveTimeout;
        this.server = server;
        this.close = graceful(this.server, {
            forceExit: false,
            signals: '',
            timeout: 10_000
        });
    }

    public async activate(): Promise<void> {
        const port = this.config.port ?? 80;
        this.port = port;
        this.server.listen(port);
        notifier().info('io.darlean.webgateways.Listening', 'Web gateway [Name] is now listening on port [Port]', () => ({
            Name: this.config.name,
            Port: port
        }));
    }

    public async deactivate(): Promise<void> {
        if (this.port) {
            // When calling server.close or even server.closeAllConnections, connections with keep-alive open
            // (for example, those when used for long-polling) are not actively ended. See https://github.com/nodejs/node/issues/2642.
            // The graceful-http library solves this.
            await this.close();
        }
        notifier().info('io.darlean.webgateways.StoppedListening', 'Web gateway [Name] stopped listening on port [Port]', () => ({
            Name: this.config.name,
            Port: this.port
        }));
    }

    @action()
    public async touch(): Promise<void> {
        //
    }

    protected async handleRequest(req: IncomingMessage, res: ServerResponse<IncomingMessage>): Promise<void> {
        try {
            const urlobj = new url.URL(req.url ?? '', 'http://' + req.headers.host);

            for (let handlerIdx = 0; handlerIdx < this.config.handlers.length; handlerIdx++) {
                const handler = this.config.handlers[handlerIdx];

                if (!!handler.method && handler.method !== req.method) {
                    continue;
                }

                let remainingPath: string | undefined;
                const matcher = this.pathMatchers[handlerIdx];
                if (matcher) {
                    remainingPath = matcher.match(urlobj.pathname);

                    if (remainingPath === undefined) {
                        continue;
                    }
                }

                if (handler.flow) {
                    switch (handler.flow.action) {
                        case 'continue': {
                            continue;
                        }
                        case 'break': {
                            res.statusCode = handler.flow.statusCode ?? 404;
                            res.statusMessage = handler.flow.statusMessage ?? 'File not Found';
                            res.end();
                            return;
                        }
                    }
                }

                const buffers = [];
                let len = 0;
                for await (const data of req) {
                    const buf = data as Buffer;
                    len += buf.length;
                    const maxContentLength = handler.maxContentLength ?? this.config.maxContentLength ?? MAX_BODY_LENGTH;
                    if (len > maxContentLength) {
                        // We break the iteration over the request data. When we do not destroy the request, request.socket becomes
                        // null by NodeJS, and this gives errors in the graceful shutdown library.
                        // See https://github.com/nodejs/undici/issues/1115
                        req.destroy();

                        res.statusCode = 413;
                        res.statusMessage = 'Payload too large';
                        res.end();
                        return;
                    }
                    buffers.push(data);
                }
                const finalBuffer = Buffer.concat(buffers);

                const request: IWebGatewayRequest = {
                    url: req.url ?? '',
                    hostname: decodeURIComponent(urlobj.hostname),
                    port: parseInt(urlobj.port),
                    protocol: urlobj.protocol,
                    username: decodeURIComponent(urlobj.username),
                    method: req.method,
                    headers: {},
                    path: urlobj.pathname,
                    pathRemainder: remainingPath,
                    body: finalBuffer
                };

                if (urlobj.search) {
                    const qs = querystring.parse(urlobj.search.substring(1));
                    const queryString: { [key: string]: string[] } = {};
                    for (const [key, value] of Object.entries(qs)) {
                        const v: string[] = typeof value === 'string' ? [value] : value ? value : [];
                        queryString[decodeURIComponent(key)] = v.map((x) => decodeURIComponent(x));
                    }
                    request.searchParams = queryString;
                }

                if (request.headers) {
                    for (const [header, value] of Object.entries(req.headers)) {
                        if (typeof value === 'string') {
                            request.headers[header] = value;
                        }
                    }
                }

                if (req.headers?.cookie) {
                    request.cookies = [];
                    for (const cookie of req.headers.cookie.split(';')) {
                        request.cookies.push(cookie.trim());
                    }
                }

                const response = await handler.action(request);

                res.statusCode = response.statusCode;
                res.statusMessage = response.statusMessage;
                if (response.headers) {
                    for (const [header, value] of Object.entries(response.headers)) {
                        res.setHeader(header, value);
                    }
                }

                if (response.cookies) {
                    for (const cookie of response.cookies) {
                        res.setHeader('set-cookie', cookie);
                    }
                }

                res.write(response.body);
                res.end();

                return;
            }

            res.statusCode = 404;
            res.statusMessage = 'File not Found';
            res.end();
        } catch (e) {
            notifier().warning(
                'io.darlean.webgateways.ProcessingFailed',
                'An error occurred during processing of web gateway request: [Error]',
                () => ({ Error: e })
            );
            res.statusCode = 500;
            res.statusMessage = 'Internal server error';
            res.end();
        }
    }
}
