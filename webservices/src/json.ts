import Ajv, { JTDParser, JTDSchemaType } from 'ajv/dist/jtd';
import { WebRequest, WebResponse } from './wrapper';
import { IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';

export class JsonRequestParser<T, D extends Record<string, unknown> = Record<string, never>> {
    protected parser: JTDParser<T>;

    constructor(schema: JTDSchemaType<T, D>) {
        const a = new Ajv();
        this.parser = a.compileParser(schema);
    }

    public async parse(request: WebRequest | IWebGatewayRequest): Promise<T> {
        if (!(request instanceof WebRequest)) {
            request = new WebRequest(request);
        }
        // This call is async because for long body, we may have to perform
        // async calls to webserver in the future to fetch next chunk
        const text = request.getTextBody();
        if (text) {
            const parsed = this.parser(text);
            if (!parsed) {
                throw new Error(`JSON validation error: ${this.parser.message} at ${this.parser.position}`);
            }
            return parsed;
        } else {
            throw new Error('No request body');
        }
    }
}

export class JsonResponseEncoder<T, D extends Record<string, unknown> = Record<string, never>> {
    protected serializer: (data: T) => string;

    constructor(schema: JTDSchemaType<T, D>) {
        const a = new Ajv();
        this.serializer = a.compileSerializer(schema);
    }

    public async pushAndEnd(value: T, response: WebResponse): Promise<IWebGatewayResponse> {
        response.setHeader('content-type', 'application/json');
        const text = this.serializer(value);
        await response.push(Buffer.from(text, 'utf-8'));
        return await response.end();
    }
}
