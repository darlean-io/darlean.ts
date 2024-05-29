import { action, ActorSuite, IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';
import * as htmlEntities from 'html-entities';
import { JsonRequestParser, JsonResponseEncoder, StaticFileHandler, WebRequest } from '@darlean/webservices';

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
    public async ask(req: IWebGatewayRequest): Promise<IWebGatewayResponse> {
        const request = WebRequest.from(req);
        const resp = request.response();
        const topic = request.getRemainingPathElements()[0];
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
    public async teach(req: IWebGatewayRequest): Promise<IWebGatewayResponse> {
        const r = WebRequest.from(req);
        const resp = r.response();

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
    public async file(req: IWebGatewayRequest): Promise<IWebGatewayResponse> {
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
