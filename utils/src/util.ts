import { performance } from 'perf_hooks';
import { currentScope } from './tracing';

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
 * @param aborter An optional {@link Aborter} instance that allows application code to cancel
 * the sleep before the specified sleep time is over. When aborted, sleep silently
 * resolves (ends) without throwing an error.
 */
export async function sleep(ms: number, aborter?: Aborter): Promise<void> {
    if (ms <= 0) {
        return new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            // console.log('Resolve timer', ms);
            resolve();
        }, ms);
        if (aborter) {
            aborter.handle(() => {
                clearTimeout(timer);
                resolve();
            });
        }
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
export function wildcardMatch(input: string, mask: string, partsOut?: string[]): boolean {
    const pattern = parseWildcardPattern(mask);
    return applyWildcardPattern(pattern, input, partsOut);
}

export interface IWildcardPattern {
    parts: string[];
}

export function parseWildcardPattern(pattern: string): IWildcardPattern {
    return {
        parts: pattern.split('*')
    };
}

export function applyWildcardPattern(pattern: IWildcardPattern, input: string, partsOut?: string[]): boolean {
    const parts = pattern.parts;

    if (parts.length === 1) {
        return input === parts[0];
    }

    let lastIdx = -1;
    if (!input.startsWith(parts[0] || '')) {
        return false;
    }
    if (!input.endsWith(parts[parts.length - 1] || '')) {
        return false;
    }
    if ((parts[0] || '').length + (parts[parts.length - 1] || '').length > input.length) {
        return false;
    }

    lastIdx = parts[0].length;
    for (let partIdx = 1; partIdx < parts.length - 1; partIdx++) {
        const startIdx = lastIdx;
        lastIdx = input.indexOf(parts[partIdx], lastIdx);
        if (lastIdx < 0) {
            return false;
        }
        partsOut?.push(input.substring(startIdx, lastIdx));
        lastIdx++;
    }
    partsOut?.push(input.substring(lastIdx, input.length - parts[parts.length - 1].length));
    return true;
}

// Ascii-codes
const CODE_A = 65;
const CODE_Z = 90;
const CODE_a = 97;
const CODE_z = 122;
const CODE_0 = 48;
const CODE_9 = 57;

export function encodeNumber(value: number) {
    if (value === 0) {
        return 'a';
    }
    if (value >= 0) {
        const base = value.toString();
        const prefix = String.fromCharCode(CODE_a + base.length);
        return prefix + base;
    } else {
        const base = (-value).toString();
        const prefix = String.fromCharCode(CODE_Z - base.length);
        return prefix + complement(base);
    }
}

export function decodeNumber(text: string, index = 0) {
    const prefixCode = text.charCodeAt(index);
    if (prefixCode === CODE_a) {
        return 0;
    }
    if (prefixCode === CODE_Z) {
        return 0;
    }
    if (prefixCode >= CODE_A && prefixCode <= CODE_Z) {
        // Negative number
        const len = CODE_Z - prefixCode;
        const base = text.substring(index + 1, index + 1 + len);
        const compl = complement(base);
        return -parseInt(compl);
    } else if (prefixCode >= CODE_a && prefixCode <= CODE_z) {
        // Positive number or zero
        const len = prefixCode - CODE_a;
        const base = text.substring(index + 1, index + 1 + len);
        return parseInt(base);
    } else {
        throw new Error('Not a decoded number');
    }
}

export function decodeNumberRtl(text: string, index?: number) {
    index = index ?? text.length - 1;
    for (let idx = index; idx >= 0; idx--) {
        const code = text.charCodeAt(idx);
        if ((code >= CODE_A && code <= CODE_Z) || (code >= CODE_a && code <= CODE_z)) {
            return [decodeNumber(text, idx), idx];
        } else if (code >= CODE_0 && code <= CODE_9) {
            // continue
        } else {
            throw new Error('Not an encoded number');
        }
    }
    throw new Error('Not an encoded number');
}

function complement(value: string) {
    let compl = '';
    for (let i = 0; i < value.length; i++) {
        compl += String.fromCharCode(CODE_9 - (value.charCodeAt(i) - CODE_0));
    }
    return compl;
}

// Important: For correct sorting, the field separator must have a lower ascii code than char sep.
const READABLE_FIELD_SEP = '-';
const READABLE_CHAR_SEP = '.';
const READABLE_FIELD_SEPS = READABLE_FIELD_SEP + READABLE_FIELD_SEP;

/**
 * Encodes an actor key into a hum-readable string. Encoding is performed in such a way that later decoding
 * produces exactly the same key as result, and that lexicographical ordering still preserves the
 * original order.
 * @param parts The key parts
 * @returns The encoded string
 */
export function encodeKeyReadable(parts: string[]): string {
    return parts
        .map((v) => {
            return ['', ...v].join(READABLE_CHAR_SEP);
        })
        .join(READABLE_FIELD_SEPS);
}

/**
 * Decodes a key that was previously encoded with [[encodeKeyReadable]].
 * @param key The key to be decoded
 * @returns The decoded key parts
 */
export function decodeKeyReadable(key: string): string[] {
    if (key === '') {
        return [];
    }

    const parts = key.split(READABLE_FIELD_SEPS);
    return parts.map((v) => v.split(READABLE_CHAR_SEP).join(''));
}

/**
 * Encodes an actor key into a string in a fast way. Does NOT preserve sorting order.
 * @param parts The key parts
 * @returns The encoded string
 */
export function encodeKeyFast(parts: string[]): string {
    const containsZero = !!parts.find((part) => part.includes('\u0000'));
    if (containsZero) {
        return 'c' + encodeKeyCompact(parts);
    } else {
        return '0' + parts.join('\u0000');
    }
}

/**
 * Decodes a key that was previously encoded with [[encodeKeyFast]].
 * @param key The key to be decoded
 * @returns The decoded key parts
 */
export function decodeKeyFast(key: string): string[] {
    if (key[0] === 'c') {
        return decodeKeyCompact(key.substring(1));
    } else if (key[0] === '0') {
        return key.split('\u0000');
    } else {
        throw new Error('Illigal key encoding');
    }
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
export function encodeKeyCompact(parts: string[]): string {
    return parts
        .map((v) => {
            let replaced = replaceAll(v, '\u0001', '\u0001\u0002');
            replaced = replaceAll(replaced, '\u0000', '\u0001\u0003');
            return replaced;
        })
        .join('\0');
}

/**
 * Decodes a key that was previously encoded with [[encodeKeyCompact]].
 * @param key The key to be decoded
 * @returns The decoded key parts
 */
export function decodeKeyCompact(key: string): string[] {
    const parts = key.split('\0');
    return parts.map((v) => {
        let decoded = replaceAll(v, '\u0001\u0003', '\u0000');
        decoded = replaceAll(decoded, '\u0001\u0002', '\u0001');
        return decoded;
    });
}

export let pendingMutexes = 0;

export class Mutex<T> {
    protected queue: Array<(value: T | undefined) => void>;
    protected held = false;

    constructor(acquire = false) {
        this.queue = [];
        if (acquire) {
            this.held = true;
        }
    }

    public tryAcquire(): boolean {
        const start = performance.now();
        try {
            if (!this.held) {
                this.held = true;
                return true;
            } else {
                return false;
            }
        } finally {
            const stop = performance.now();
            currentScope().info('INLINE ACQUIRE TOOK [Duration]', () => ({ Duration: stop - start }));
        }
    }

    public async acquire(): Promise<T | undefined> {
        currentScope().info('ASYNC ACQUIRE [Held]', () => ({ Held: this.held }));
        if (!this.held) {
            this.held = true;
            return;
        }
        return new Promise((resolve) => {
            if (this.held) {
                pendingMutexes++;
                this.queue.push(resolve);
            } else {
                this.held = true;
                resolve(undefined);
            }
        });
    }

    public release(value: T | undefined): boolean {
        if (this.queue.length > 0) {
            const q0 = this.queue[0];
            this.queue.splice(0, 1);
            pendingMutexes--;
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

/**
 * Instances of this class can be passed to objects that support early abortion of long-running
 * operations.
 *
 * Abortion works by the application code creating a new {@link Aborter} instance and somehow pairing
 * that instance with the object that provides long-running operations. That object then invokes
 * the {@link Aborter.handle} method with a callback function as parameter that is invoked when
 * the application code invokes {@link Aborter.abort}. The callback then executes the necessary logic
 * to abort the long-running operation.
 *
 * @remarks
 * An {@link Aborter} instance should only be used once. When multiple long-running actions need
 * to be aborted, multiple instances should be created (one for each such long-running action).
 */
export class Aborter {
    private handler?: () => void;

    /**
     * To be invoked by the objects that provide long-running operations in order to register their handler
     * that is invoked (at most once) when application code invokes {@link Aborter.abort}.
     * @param handler The callback function that performs the actual abort of the long-running operation.
     */
    public handle(handler: (() => void) | undefined) {
        this.handler = handler;
    }

    /**
     * Aborts the long-running operation. It is safe to invoke this method more than once, but only
     * the first invocation effectively aborts the long-running operation.
     */
    public abort() {
        const handler = this.handler;
        this.handler = undefined;
        handler?.();
    }
}

export type ApplicationStopHandler = (signal?: string, code?: number, error?: Error) => void;
let applicationStopHandlers: ApplicationStopHandler[] = [];
let stopHandlersRegistered = false;

export function onApplicationStop(handler: ApplicationStopHandler) {
    applicationStopHandlers.push(handler);
    if (!stopHandlersRegistered) {
        stopHandlersRegistered = true;

        process.on('exit', (code) => {
            const handlers = applicationStopHandlers;
            applicationStopHandlers = [];
            handlers.forEach((handler) => handler(undefined, code, undefined));
        });

        ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((signal) =>
            process.on(signal, () => {
                const handlers = applicationStopHandlers;
                applicationStopHandlers = [];
                handlers.forEach((handler) => handler(signal, undefined, undefined));
            })
        );

        process.on('uncaughtException', (error) => {
            process.exitCode = 1; // According to docs, without setting it here it will be set to 0
            const handlers = applicationStopHandlers;
            applicationStopHandlers = [];
            handlers.forEach((handler) => handler(undefined, undefined, error));
        });
    }
}

export function offApplicationStop(handler: ApplicationStopHandler) {
    const idx = applicationStopHandlers.indexOf(handler);
    if (idx >= 0) {
        applicationStopHandlers.splice(idx, 1);
    }
}

export function resolveDataPath(path: string, data: unknown): [unknown, string[]] {
    const parts = path.split('.');
    let value = data;
    for (const part of parts) {
        if (value === undefined) {
            return [undefined, parts];
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value = (value as any)[part];
    }
    return [value, parts];
}

/**
 * Represents a single expression in an {@link IMultiFilter}.
 */
export interface IMultiFilterExpression {
    sign: string;
    pattern: IWildcardPattern;
}

/**
 * Presents a parsed multi filter.
 *
 * @see {@link parseMultiFilter}
 */
export interface IMultiFilter {
    expressions: IMultiFilterExpression[];
}

/**
 * Parses a multi filter.
 *
 * The filter can be a single string or an array of strings. Each of the strings must contain one or more
 * comma-separated expressions. Each expression must start with a sign character (typically `+` or `-`), followed by
 * a wildcard pattern (see {@link applyWildcardPattern}).
 * @returns an {@link IMultiFilter} instance that can be passed to subsequent calls to {@link applyMultiFilter}.
 */
export function parseMultiFilter(filter: string | string[]): IMultiFilter {
    const result: IMultiFilter = { expressions: [] };
    const parts = Array.isArray(filter) ? filter : filter.split(',').map((x) => x.trim());
    for (const part of parts) {
        const sign = part[0];
        const mask = part.substring(1);
        result.expressions.push({ sign, pattern: parseWildcardPattern(mask) });
    }
    return result;
}

/**
 * Applies a multifilter (obtained by {@link parseMultiFilter}) to a value.
 *
 * @returns The sign of the first expression in `filter` of which the pattern matches with the
 * provided `value`, or `defaultSign` when none of the expressions matches.
 */
export function applyMultiFilter(filter: string | IMultiFilter, value: string, defaultSign = ''): string {
    if (typeof filter === 'string') {
        filter = parseMultiFilter(filter);
    }

    for (const expr of filter.expressions) {
        if (applyWildcardPattern(expr.pattern, value)) {
            return expr.sign;
        }
    }

    return defaultSign;
}

/**
 * Recursively filters the provided `data` structure by only returning elements that match with the `multiFilter`.
 * @param multiFilter The multifilter against which the elements within data are matched.
 * @param data Object (with nested objects and arrays and primitives) that needs to be filtered
 * @param path Optional path that is prefixed to the name of elements in `data`.
 * @returns An object with the same structure as `data`, but only containing those elements that match with the multifilter.
 * @remarks
 * Only elements of type `object` are processed recursively. Other elements (like arrays and primitive types) are
 * either ignored or copied over as they are. It is not possible to filter on individual array elements.
 */
export function filterStructure(multiFilter: string | IMultiFilter, data: unknown, path?: string) {
    //if ( (path !== '') && (applyMultiFilter(multiFilter, path) !== '+')) {
    //    return undefined;
    //}

    if (isObject(data)) {
        const obj: { [key: string]: unknown } = {};
        let haveEntries = false;
        for (const [key, value] of Object.entries(data as { [key: string]: unknown })) {
            const p = path ? [path, key].join('.') : key;
            const struct = filterStructure(multiFilter, value, p);
            if (struct !== undefined) {
                haveEntries = true;
                obj[key] = struct;
            }
        }
        return haveEntries ? obj : path === '' ? {} : undefined;
    } else {
        if (applyMultiFilter(multiFilter, path ?? '') === '+') {
            return data;
        }
    }
}
