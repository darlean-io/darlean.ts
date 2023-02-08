import * as fs from 'fs';
import { IWebServiceRequest, IWebServiceResponse } from './types';
import { Response } from './wrapper';
import mime from 'mime-types';

export class StaticFileHandler {
    private basePaths: string[];
    private indexFiles: string[];

    constructor(basePaths: string[], indexFiles: string[]) {
        this.basePaths = basePaths;
        this.indexFiles = indexFiles;
    }

    public async handle(req: IWebServiceRequest): Promise<IWebServiceResponse> {
        const resp = new Response(req);
        const path = req.placeholders?.['*'] ?? '';
        const parts = path.split('/').filter((x) => x !== '.' && x !== '..');
        const newPath = parts.join('/');
        const mimetype = mime.lookup(newPath) || undefined;
        for (const basePath of this.basePaths) {
            const fullPath = [basePath, path].join('/');
            for (const indexFile of ['', ...this.indexFiles]) {
                const fullPath2 = indexFile === '' ? fullPath : [fullPath, indexFile].join('/');
                try {
                    const stream = fs.createReadStream(fullPath2);
                    if (mimetype) {
                        resp.setHeader('content-type', mimetype);
                    }
                    for await (const chunk of stream) {
                        await resp.push(chunk);
                    }
                    return resp.end();
                } catch (e) {
                    // Ignore file not found
                }
            }
        }
        return resp.endWithStatusCode(404, 'File not found');
    }
}
