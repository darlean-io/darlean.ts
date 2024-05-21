import * as fs from 'fs';
import { WebResponse } from './wrapper';
import mime from 'mime-types';
import { IWebGatewayRequest, IWebGatewayResponse } from '@darlean/base';

export interface IStaticFileHandlerOptions {
    /**
     * List of paths in which the static file handler looks to find files. The request path is (after removal of `.` and `..`) appended to each of the
     * base paths. Base paths are processed in the order specified (first base path is tried first).
     *
     * Usually, only base path will be present. Multiple base paths make it possible to provide 'fall-back' folders. A use case for that could be the
     * situation in which there is a standard prebuilt webapp which needs project-specific customizations. The base app could be placed in the `base` folder,
     * and the override files (like different `css` files to adjust project-specific styling of the webapp) could go in the `project` folder. The
     * base paths could then be configured as `['project', 'base']`, which would instruct the static file handler to first see if a requested file is
     * in the `project` folder, and only when that is not the case, use the file in the `base` folder.
     */
    basePaths: string[];

    /**
     * List of file names that are added to the request path when no file could be found for the request path. When not specified, no index file names
     * are used (even not `index.html`).
     */
    indexFiles: string[];

    /**
     * When set to true, and no file is found for the request path in combination with any of the `indexFiles` within a certain base path, the
     * parent paths of the request path are tried recursively (but iteration stops at the base path -- the static file handler will never serve files
     * higher than the base paths).
     *
     * This feature is useful for serving sinple page applications that use the request path for routing (like `/blog/123`), but only have a
     * single '/index.html' file at the root of a base path that must be served for each such request.
     *
     * Defaults to `false`.
     */
    recurseUp?: boolean;

    /**
     * When not explicitly set to `false`, a request for path that does not end with a slash is redirected to the same path
     * with a trailing slash when an index file is used. This solves the issue for resolviong relative links from within a
     * html page when the path looks like `mypath` instead of `mypath/`.
     */
    indexRedirect?: boolean;
}

export class StaticFileHandler {
    private basePaths: string[];
    private indexFiles: string[];
    private recurseUp: boolean;
    private indexRedirect: boolean;

    constructor(options: IStaticFileHandlerOptions) {
        this.basePaths = options.basePaths;
        this.indexFiles = options.indexFiles;
        this.recurseUp = options.recurseUp ?? false;
        this.indexRedirect = options.indexRedirect ?? true;
    }

    public async handle(req: IWebGatewayRequest): Promise<IWebGatewayResponse> {
        const resp = new WebResponse(req);
        const path = req.placeholders?.['*'] ?? '';
        const parts = path.split('/').filter((x) => x !== '.' && x !== '..');
        for (const basePath of this.basePaths) {
            let subpath = [...parts];
            while (true) {
                const newPath = subpath.join('/');

                const fullPath = [basePath, newPath].join('/');
                for (const indexFile of ['', ...this.indexFiles]) {
                    const fullPath2 = indexFile === '' ? fullPath : [fullPath, indexFile].join('/');
                    try {
                        const mimetype = mime.lookup(fullPath2) || undefined;
                        const stream = fs.createReadStream(fullPath2);
                  
                        if (mimetype) {
                            resp.setHeader('content-type', mimetype);
                        }
                        
                        let checkRedirect = this.indexRedirect;
                        for await (const chunk of stream) {
                            // Only when the file exists (and we know that it exists when we have successfully read a chunk),
                            // check for a path without trailing path delimiter. And then redirect to the path with trailing
                            // path delimiter.
                            if (checkRedirect) {
                                if ((indexFile !== '') && (!req.path?.endsWith('/'))) {
                                    resp.setHeader('Location', (req.path ?? '') + '/');
                                    return resp.endWithStatusCode(301, 'Moved Permanently');
                                }
                                checkRedirect = false;        
                            }

                            await resp.push(chunk);
                        }
                        return resp.end();
                    } catch (e) {
                        // Ignore file not found
                    }
                }
                if (!this.recurseUp) {
                    break;
                }
                if (subpath.length === 0) {
                    break;
                }
                subpath = subpath.slice(0, -2);
            }
        }
        return resp.endWithStatusCode(404, 'File not found');
    }
}
