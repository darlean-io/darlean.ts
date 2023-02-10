import { action, IActivatable, IDeactivatable } from '@darlean/base';
import { notifier, wildcardMatch } from '@darlean/utils';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import url from 'url';
import querystring from 'querystring';
import { IWebServiceRequest, IWebServiceResponse } from '@darlean/webservice';

const MAX_BODY_LENGTH = 100 * 1000;

export interface IHandler {
    method?: string;
    path?: string;
    action: (req: IWebServiceRequest) => Promise<IWebServiceResponse>;
    placeholders?: string[];
}

export interface IHost {
    name: string;
    port: number;
    handlers: IHandler[];
}

export class WebServiceHostActor implements IActivatable, IDeactivatable {
    protected server: Server;
    protected config: IHost;
    protected port?: number;

    constructor(config: IHost) {
        this.config = config;
        const server = createServer((req, res) => {
            setImmediate(async () => {
                await this.handleRequest(req, res);
            });
        });
        this.server = server;
    }

    public async activate(): Promise<void> {
        const port = this.config.port ?? 80;
        this.port = port;
        this.server.listen(port);
        notifier().info('io.darlean.webservice.Listening', 'Web service [Name] is now listening on port [Port]', () => ({
            Name: this.config.name,
            Port: port
        }));
    }

    public async deactivate(): Promise<void> {
        await new Promise<void>((resolve, error) => {
            this.server.close((err) => {
                if (err) {
                    error(err);
                }
                resolve();
            });
        });
        notifier().info('io.darlean.webservice.StoppedListening', 'Web service [Name] stopped listening on port [Port]', () => ({
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

            // Also decodes special characters like %2f to '/'. The wildcard matching should not depend on percent-encodings.
            const pathname = decodeURIComponent(urlobj.pathname);

            for (const handler of this.config.handlers) {
                if (!!handler.method && handler.method !== req.method) {
                    continue;
                }

                const matches: string[] = [];
                if (handler.path) {
                    if (!wildcardMatch(pathname, handler.path, matches)) {
                        continue;
                    }
                }

                const buffers = [];
                let len = 0;
                for await (const data of req) {
                    const buf = data as Buffer;
                    len += buf.length;
                    if (len > MAX_BODY_LENGTH) {
                        res.statusCode = 413;
                        res.statusMessage = 'Payload too large';
                        return;
                    }
                    buffers.push(data);
                }
                const finalBuffer = Buffer.concat(buffers);

                const request: IWebServiceRequest = {
                    url: req.url ?? '',
                    hostname: decodeURIComponent(urlobj.hostname),
                    port: parseInt(urlobj.port),
                    protocol: urlobj.protocol,
                    username: decodeURIComponent(urlobj.username),
                    method: req.method,
                    headers: {},
                    path: pathname,
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

                if (req.headers?.cookies) {
                    request.cookies = [];
                    for (const cookie of req.headers.cookies) {
                        request.cookies.push(cookie);
                    }
                }

                if (matches.length > 0) {
                    const placeholders: { [name: string]: string } = {};
                    for (let idx = 0; idx < matches.length; idx++) {
                        const name = handler.placeholders?.[idx] ?? ''.padEnd(idx + 1, '*');
                        placeholders[name] = matches[idx];
                    }
                    request.placeholders = placeholders;
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
            res.write('File not Found');
            res.end();
        } catch (e) {
            notifier().warning(
                'io.darlean.webservice.ProcessingFailed',
                'An error during processing of web service request: [Error]',
                () => ({ Error: e })
            );
            res.statusCode = 500;
            res.write('Internal server error');
            res.end();
        }
    }
}
