import { action, ActorSuite } from '@darlean/base';
import {
    IWebServiceRequest,
    IWebServiceResponse,
    JsonRequestParser,
    JsonResponseEncoder,
    StaticFileHandler
} from '@darlean/webservice';
import { Request, Response } from '@darlean/webservice';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import * as htmlEntities from 'html-entities';

export const WEB_API_SERVICE = 'WebApiService';

interface ITeachRequest {
    topic: string;
    fact: string;
    value: number;
}

interface ITeachResponse {
    comment: string;
}

export class WebApiService {
    protected oracleService: IOracleService;
    protected teachDecoder: JsonRequestParser<ITeachRequest>;
    protected teachEncoder: JsonResponseEncoder<ITeachResponse>;
    protected staticFileHandler: StaticFileHandler;

    constructor(oracleService: IOracleService, staticFileHandler: StaticFileHandler) {
        this.oracleService = oracleService;
        this.staticFileHandler = staticFileHandler;
        this.teachDecoder = new JsonRequestParser({
            properties: {
                topic: { type: 'string' },
                fact: { type: 'string' },
                value: { type: 'float64' }
            }
        });
        this.teachEncoder = new JsonResponseEncoder({
            properties: {
                comment: { type: 'string' }
            }
        });
    }

    @action({ locking: 'shared' })
    public async ask(req: IWebServiceRequest): Promise<IWebServiceResponse> {
        const resp = new Response(req);
        const topic = req.placeholders?.['*'];
        const question = req.searchParams?.question[0];
        if (!topic) {
            return resp.endWithStatusCode(400, 'Topic is missing');
        }
        if (!question) {
            return resp.endWithStatusCode(400, 'Question is missing');
        }

        const answer = await this.oracleService.ask(topic, question);

        const head = '<head><link rel="stylesheet" href="/style.css"></head>';
        // Always encode variables that we insert in html! Although answer has type number, malicious code
        // can also put a string in it. Better safe than sorry!
        const body = `<body><div class="page"><h1>Thank you for your question!</h1><div class="line">The answer is: ${htmlEntities.encode(
            answer.toString()
        )}</div></div></body>`;
        const html = `<html>${head}${body}</html>`;
        resp.pushText('text/html', html);
        return resp.end();
    }

    @action({ locking: 'exclusive' })
    public async teach(req: IWebServiceRequest): Promise<IWebServiceResponse> {
        const r = new Request(req);
        const resp = new Response(req);

        const teachReq = await this.teachDecoder.parse(r);

        await this.oracleService.teach(teachReq.topic, teachReq.fact, teachReq.value);

        return this.teachEncoder.pushAndEnd(
            {
                comment: 'Nice fact! Cool!'
            },
            resp
        );
    }

    @action({ locking: 'shared' })
    public async file(req: IWebServiceRequest): Promise<IWebServiceResponse> {
        return this.staticFileHandler.handle(req);
    }
}

export default function suite() {
    return new ActorSuite([
        {
            type: WEB_API_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                const service = context.portal.retrieve<IOracleService>(ORACLE_SERVICE, []);
                const sfh = new StaticFileHandler({
                    basePaths: ['./webroot/'],
                    indexFiles: ['index.html']
                });
                return new WebApiService(service, sfh);
            }
        }
    ]);
}
