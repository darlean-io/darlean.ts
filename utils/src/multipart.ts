/**
 * Multi-part support
 */

import * as uuid from 'uuid';

const NEWLINE = '\r\n';
const BUF_NEWLINE = Buffer.from('\r\n');

export interface IMultiPart {
    headers?: {[header: string]: string};
    body: Buffer;
}

export class MultipartParser {
    public parse(buffer: Buffer): {parts: IMultiPart[], boundary?: string} {
        const headers: {[header: string]: string} = {};
        const headersEnd = parseMimeHeaders(buffer, headers);

        let boundaryText: string | undefined;
        let boundary: Buffer | undefined;
        let endBoundary: Buffer | undefined;
        
        const contentType = headers['content-type'];
        if (!contentType) {
            throw new Error('Invalid multipart data: Header does not contain a multipart/* content-type');
        }

        if (contentType?.startsWith('multipart/')) {
            const parts = contentType.split('boundary=');
            if (parts.length === 2) {
                boundaryText = parts[1].trim();
                boundary = Buffer.from(NEWLINE + '--' + boundaryText + NEWLINE, 'utf-8');
                endBoundary = Buffer.from(NEWLINE + '--' + boundaryText + '--', 'utf-8');
            } else {
                throw new Error('No boundary found in multipart content-type header');
            }
        } else {
            // Assume regular (non multipart) encoding of a single part.
            const partBody = buffer.subarray(headersEnd);
            const parts = [{headers: headers, body: partBody}];
            return { parts };
        }

        const multiparts: IMultiPart[] = [];

        if (boundary && endBoundary) {
            let start = buffer.indexOf(boundary, headersEnd);
            while (start >= 0) {
                const end = buffer.indexOf(boundary, start + boundary.byteLength);
                const veryEnd = end >= 0 ? end : buffer.indexOf(endBoundary, start + boundary.byteLength);
                if (veryEnd < 0) {
                    throw new Error('No boundary finalizer');
                }
                const part = buffer.subarray(start + boundary.byteLength, veryEnd);
                const partHeaders: {[header: string]: string} = {};
                const partHeadersEnd = parseMimeHeaders(part, partHeaders);
                const body = part.subarray(partHeadersEnd);
                const partHeaders2 = {...headers, ...partHeaders};
                multiparts.push({headers: partHeaders2, body});
                start = end;
                if (end < 0) {
                    break;
                }
            }
        }
        return { parts: multiparts, boundary: boundaryText};
    }
}

export class MultiPartGenerator {
    public generate(parts: IMultiPart[], boundary?: string, headers?: {[header: string]: string}) {
        if (parts.length === 1) {
            const headers2 = {...headers ?? {}, ...parts[0].headers ?? {}};
            const headerBuf = mimeHeadersToBuf(headers2);
            return Buffer.concat([headerBuf, parts[0].body]);
        }

        const headers2 = headers ? {...headers} : {};
        boundary = boundary ?? uuid.v4();
        headers2['content-type'] = `multipart/mixed; boundary=${boundary}`;
        const headerBuf = mimeHeadersToBuf(headers2);

        const boundaryBuf = Buffer.from(NEWLINE + '--' + boundary + NEWLINE, 'utf-8');
        const endBoundaryBuf = Buffer.from(NEWLINE + '--' + boundary + '--', 'utf-8');

        const buffers: Buffer[] = [headerBuf];

        for (const part of parts) {
            buffers.push(boundaryBuf);

            const partHeaderBuf = mimeHeadersToBuf(part.headers);
            buffers.push(partHeaderBuf);

            buffers.push(part.body);
        }
        buffers.push(endBoundaryBuf);

        return Buffer.concat(buffers);
    }
}

export function parseMimeHeaders(buffer: Buffer, headers: {[header: string]: string}): number {
    let start = 0;
    while (true) {
        const end = buffer.indexOf(BUF_NEWLINE, start);
        const line = (end >= 0) ? buffer.toString('utf-8', start, end).trim() : '';
        if (line.length === 0) {
            return end + BUF_NEWLINE.byteLength;
        }
        const parts = line.split(':');
        if (parts.length > 1) {
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim();
            headers[key] = value;
        }
        start = end + BUF_NEWLINE.byteLength;
    }
}

export function mimeHeadersToBuf(headers?: {[header: string]: string}) {
    const headerString = headers ? Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join(NEWLINE) + NEWLINE + NEWLINE : NEWLINE;
    const headerBuf = Buffer.from(headerString, 'utf-8');
    return headerBuf;
}
