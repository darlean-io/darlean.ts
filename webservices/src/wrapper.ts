import { IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';

export class WebRequest {
    protected request: IWebGatewayRequest;

    constructor(request: IWebGatewayRequest) {
        this.request = request;
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

    public getRawBody(): Buffer | undefined {
        return this.request.body;
    }

    public getTextBody(): string | undefined {
        return this.request.body?.toString('utf-8');
    }

    public getUnderlyingRequest(): IWebGatewayRequest {
        return this.request;
    }

    public response(): WebResponse {
        return new WebResponse(this.request);
    }
}

export class WebResponse {
    protected request: IWebGatewayRequest;
    protected response: IWebGatewayResponse;
    protected headersSent = false;
    protected bodyParts: Buffer[];

    constructor(request: IWebGatewayRequest) {
        this.request = request;
        this.response = {
            statusCode: 200,
            statusMessage: 'OK',
            headers: {}
        };
        this.bodyParts = [];
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
