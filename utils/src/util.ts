import { performance } from 'perf_hooks';

export function isObject(v: unknown) {
    return !!v && (v as object).constructor === Object;
}

export function ticks(delta?: number) {
    return performance.now() + (delta || 0);
}

/**
 * Sleeps for [[ms]] milliseconds. When ms is 0, `setImmediate` is used so that the function
 * returns immediately after giving the NodeJS event loop the chance to process pending events.
 * @param ms The amount of milliseconds to wait
 */
export async function sleep(ms: number): Promise<void> {
    if (ms <= 0) {
        return new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Replaces all occurrances of `search` within `input` with `replace`. The replacement is
 * performed in one sweep (when the result of the replacement contains occurrances of
 * 'input', they are not replaced again).
 * @param input The text in which the search and replace should take place
 * @param search The text to search for
 * @param replace The text to replace the search text with
 * @returns The input with all occurrances of search replaced by replace.
 */
export function replaceAll(input: string, search: string, replace: string): string {
    return input.split(search).join(replace);
}

/**
 * Performs a wildcard match on [[input]]. The [[mask]] can contain zero or more occurrances
 * of the wildcard character (`*`).
 * @param input The text that should be evaluated against the mask
 * @param mask The mask that is evaluated against the input
 * @returns Whether text matches with the mask.
 */
export function wildcardMatch(input: string, mask: string): boolean {
    const parts = mask.split('*');
    let lastIdx = -1;
    if (!input.startsWith(parts[0] || '')) {
        return false;
    }
    if (!input.endsWith(parts[0] || '')) {
        return false;
    }
    lastIdx = parts[0].length;
    for (let partIdx = 1; partIdx < parts.length - 1; partIdx++) {
        lastIdx = input.indexOf(parts[partIdx], lastIdx);
        if (lastIdx < 0) {
            return false;
        }
    }
    return true;
}

/**
 * Encodes an actor key into a string. Encoding is performed in such a way that later decoding
 * produces exactly the same key as result, and that lexicographical ordering still preserves the
 * original order.
 *
 * Warning: This function uses unicode characters 1-3 as delimiters and escape characters, so the output
 * of this function should only be used on places where these characters are accepted. Also, no escaping
 * of other 'typically unsafe' characters like `/` is performed. In particular, this means that the encoded
 * keys should not be used to create files/folders on file systems or web services like S3.
 * @param parts The key parts
 * @returns The encoded string
 */
export function encodeKey(parts: string[]): string {
    return parts
        .map((v) => {
            let replaced = replaceAll(v, '\u0001', '\u0001\u0002');
            replaced = replaceAll(replaced, '\u0000', '\u0001\u0003');
            return replaced;
        })
        .join('\0');
}

/**
 * Decodes a key that was previously encoded with [[encodeKey]].
 * @param key The key to be decoded
 * @returns The decoded key parts
 */
export function decodeKey(key: string): string[] {
    const parts = key.split('\0');
    return parts.map((v) => {
        let decoded = replaceAll(v, '\u0001\u0003', '\u0000');
        decoded = replaceAll(decoded, '\u0001\u0002', '\u0001');
        return decoded;
    });
}

export class Mutex<T> {
    protected queue: Array<(value: T | undefined) => void>;
    protected held = false;

    constructor(acquire = false) {
        this.queue = [];
        if (acquire) {
            this.held = true;
        }
    }

    public async acquire(): Promise<T | undefined> {
        if (this.held) {
            return new Promise((resolve) => {
                this.queue.push(resolve);
            });
        }
        this.held = true;
    }

    public release(value: T | undefined): boolean {
        if (this.queue.length > 0) {
            const q0 = this.queue[0];
            this.queue.splice(0, 1);
            q0(value);
            return true;
        }
        this.held = false;
        return false;
    }
}

export class Interruptor {
    protected rejects: Array<(e: unknown) => void>;
    protected interrupted = false;

    constructor() {
        this.rejects = [];
    }

    public async invoke<T>(func: () => Promise<T>): Promise<T> {
        if (this.interrupted) {
            throw new Error('INTERRUPTED');
        }
        const promise = new Promise<T>((resolve, reject) => {
            const p = func();
            p.then((x) => resolve(x))
                .catch((e) => reject(e))
                .finally(() => {
                    const idx = this.rejects.indexOf(reject);
                    if (idx >= 0) {
                        this.rejects.splice(idx, 1);
                    }
                });
            this.rejects.push(reject);
        });
        return promise;
    }

    public interrupt() {
        this.interrupted = true;
        const rejects = this.rejects;
        this.rejects = [];
        for (const reject of rejects) {
            reject(new Error('INTERRUPTED'));
        }
    }

    public reset() {
        this.interrupted = false;
    }
}
