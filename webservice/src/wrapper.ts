import { IWebServiceRequest, IWebServiceResponse } from './types';

export class Request {
    protected request: IWebServiceRequest;

    constructor(request: IWebServiceRequest) {
        this.request = request;
    }

    public getHeader(header: string): string | undefined {
        return this.request.headers?.[header.toLowerCase()];
    }

    public getRawBody(): Buffer | undefined {
        return this.request.body;
    }

    public getTextBody(): string | undefined {
        return this.request.body?.toString('utf-8');
    }

    public response(): Response {
        return new Response(this.request);
    }
}

export class Response {
    protected request: IWebServiceRequest;
    protected response: IWebServiceResponse;
    protected headersSent = false;
    protected bodyParts: Buffer[];

    constructor(request: IWebServiceRequest) {
        this.request = request;
        this.response = {
            statusCode: 200,
            statusMessage: 'OK',
            headers: {}
        };
        this.bodyParts = [];
    }

    public async endWithStatusCode(statusCode: number, statusMessage: string): Promise<IWebServiceResponse> {
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

    public async end(): Promise<IWebServiceResponse> {
        this.response.body = Buffer.concat(this.bodyParts);
        return this.response;
    }
}
