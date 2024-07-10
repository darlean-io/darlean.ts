import { IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';
import querystring from 'querystring';

export type SearchParamSource = 
    // Always use url as source, even for non GET requests
    'url' |
    // Only use the url as source when the request is a GET
    'url-when-get' | 
    // Always use the cody as source, even when the content-type is not `application/x-www-form-urlencoded`
    'body' |
    // Only use the body as source when the content-type is `application/x-www-form-urlencoded`
    'body-when-urlencoded';

export class WebRequest {
    protected request: IWebGatewayRequest;

    private constructor(request: IWebGatewayRequest) {
        this.request = request;
    }

    public static from(request: IWebGatewayRequest) {
        return new WebRequest(request);
    }

    public getHeader(header: string): string | undefined {
        return this.request.headers?.[header.toLowerCase()];
    }

    public getCookie(name: string): string | undefined {
        const prefix = name + '=';
        const cookie = this.request.cookies?.find((x) => x.startsWith(prefix));
        if (cookie === undefined) {
            return undefined;
        }
        const contents = cookie.substring(prefix.length).trim();
        if (contents.length >= 2) {
            if (contents[0] === '"' && contents.at(-1) === '"') {
                return contents.substring(1, contents.length - 1);
            }
        }
        return contents;
    }

    public getCookies(name: string): string[] {
        if (!this.request.cookies) {
            return [];
        }
        const results: string[] = [];
        const prefix = name + '=';
        const cookies = this.request.cookies.filter((x) => x.startsWith(prefix));
        for (const cookie of cookies) {
            const contents = cookie.substring(prefix.length).trim();
            if (contents.length >= 2 && contents[0] === '"' && contents.at(-1) === '"') {
                results.push(contents.substring(1, contents.length - 1));
            } else {
                results.push(contents);
            }
        }
        return results;
    }

    /**
     * @returns Whether the request has the provided content type. Matching is performed case-insensitive.
     */
    public hasContentType(contentType: string) {
        return (this.getContentType() === contentType.toLowerCase());
    }

    /**
     * @returns The first part of the content type (before the optional semicolon) converted to lowercase.
     */
    public getContentType() {
        const fullValue = this.getHeader('Content-Type');
        if (!fullValue) { return undefined; }
        return fullValue.split(';', 2)[0].trim().toLowerCase();
    }

    /**
     * @returns The rawe request body as a buffer, or undefined when there is no body.
     */
    public getRawBody(): Buffer | undefined {
        return this.request.body;
    }

    /**
     * @returns The request body converted to text assuming utf8 encoding, or undefined when there is no body.
     */
    public getTextBody(): string | undefined {
        return this.request.body?.toString('utf-8');
    }

    /**
     * Get the search parameters from the content body and/or the url as specified by the
     * ordered list of sources. The parameter values are decoded before they are returned.
     * Provide either `url` or `url-when-get` (but not both) as source to prevent duplicate results.
     * Provide either 'body` or `cody-when-urlencoded` (but not both) as source to prevent duplicate results.
     */
    public getSearchParams(sources: SearchParamSource[] = ['url', 'body']): { [key: string]: string[] } {
        const result: { [key: string]: string[] } = {};

        function merge(input: { [key: string]: string[] }) {
            for (const [key, values] of Object.entries(input)) {
                let current = result[key];
                if (!current) {
                    result[key] = current = [];
                }
                current.push(...values);
            }
        }

        for (const source of sources) {
            switch (source) {
                case 'url-when-get':
                case 'url': {
                    if ((source === 'url-when-get') && (this.request.method !== 'GET')) { break; }
                    const params = this.request.searchParams;
                    if (params) {
                        merge(params);
                    }
                    break;
                }

                case 'body-when-urlencoded':
                case 'body': {
                    if ( source === 'body-when-urlencoded' && (!this.hasContentType('application/x-www-form-urlencoded'))) { break; }
                    const body = this.getTextBody();
                    if (!body) { break; }
                    const qs = querystring.parse(body);
                    const queryString: { [key: string]: string[] } = {};
                    for (const [key, value] of Object.entries(qs)) {
                        const v: string[] = typeof value === 'string' ? [value] : value ? value : [];
                        queryString[decodeURIComponent(key)] = v.map((x) => decodeURIComponent(x));
                    }
                    merge(queryString);
                }
            }
        }
        return result;
    }
    

    public getUnderlyingRequest(): IWebGatewayRequest {
        return this.request;
    }

    public response(): WebResponse {
        return WebResponse.from(this.request);
    }

    /**
     * Returns the url-decoded path elements that remain after having been prefix-matched by the web gateway.
     */
    public getRemainingPathElements(): string[] {
        if (!this.request.pathRemainder) {
            return [];
        }
        const remainder = this.request.pathRemainder.startsWith('/')
            ? this.request.pathRemainder.substring(1)
            : this.request.pathRemainder;

        const parts = remainder.split('/');
        return parts.map((part) => decodeURIComponent(part));
    }
}

export class WebResponse {
    protected request: IWebGatewayRequest;
    protected response: IWebGatewayResponse;
    protected headersSent = false;
    protected bodyParts: Buffer[];

    private constructor(request: IWebGatewayRequest) {
        this.request = request;
        this.response = {
            statusCode: 200,
            statusMessage: 'OK',
            headers: {}
        };
        this.bodyParts = [];
    }

    public static from(request: IWebGatewayRequest) {
        return new WebResponse(request);
    }

    public async endWithStatusCode(statusCode: number, statusMessage: string): Promise<IWebGatewayResponse> {
        if (this.headersSent) {
            throw new Error('Headers are already sent');
        }
        this.response.statusCode = statusCode;
        this.response.statusMessage = statusMessage;
        return await this.end();
    }

    public setStatusCode(statusCode: number, statusMessage: string) {
        if (this.headersSent) {
            throw new Error('Headers are already sent');
        }
        this.response.statusCode = statusCode;
        this.response.statusMessage = statusMessage;
    }

    public setHeader(header: string, value: string) {
        if (this.headersSent) {
            throw new Error('Headers are already sent');
        }
        if (this.response.headers) {
            this.response.headers[header] = value;
        }
    }

    public setCookie(value: string) {
        if (this.headersSent) {
            throw new Error('Headers are already sent');
        }
        if (!this.response.cookies) {
            this.response.cookies = [];
        }
        if (this.response.cookies) {
            this.response.cookies.push(value);
        }
    }

    public async push(buffer: Buffer) {
        this.headersSent = true;

        // A future implementation may start pushing body parts directly to the
        // webserver when the body size is larger than a certain threshold
        this.bodyParts.push(buffer);
    }

    public async pushText(contentType: string, value: string) {
        if (this.response.headers?.['content-type'] !== value) {
            this.setHeader('content-type', contentType);
        }
        await this.push(Buffer.from(value, 'utf-8'));
    }

    public async end(): Promise<IWebGatewayResponse> {
        this.response.body = Buffer.concat(this.bodyParts);
        return this.response;
    }
}
