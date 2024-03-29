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
    // Performance optimization: return early when the search string is not included in input.
    if (!input.includes(search)) {
        return input;
    }
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
        if (!this.held) {
            this.held = true;
            return true;
        } else {
            return false;
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

/**
 * Normalizes a string so that substring matches becomes more robust in the presence of special characters
 * like diacritics (`é`) and compound characters (like `Æ`).
 *
 * Normalization works by removing the diacritic signs (`é -> e`), unpacking compound characters (`Æ -> AE`)
 * and other symbols (like `ﬀ -> ff`).
 *
 * The casing is preserved during normalization. For case-insensitive uses, convert the normalized string to
 * uppercase or lowercase via `string.toUpperCase` respectively `string.toLowerCase`.
 */
export function normalize(value: string): string {
    const unicodeToAsciiMap: { [char: string]: string } = {
        Ⱥ: 'A',
        Æ: 'AE',
        Ꜻ: 'AV',
        Ɓ: 'B',
        Ƀ: 'B',
        Ƃ: 'B',
        Ƈ: 'C',
        Ȼ: 'C',
        Ɗ: 'D',
        ǲ: 'D',
        ǅ: 'D',
        Đ: 'D',
        Ƌ: 'D',
        Ǆ: 'DZ',
        Ɇ: 'E',
        Ꝫ: 'ET',
        Ƒ: 'F',
        Ɠ: 'G',
        Ǥ: 'G',
        Ⱨ: 'H',
        Ħ: 'H',
        Ɨ: 'I',
        Ꝺ: 'D',
        Ꝼ: 'F',
        Ᵹ: 'G',
        Ꞃ: 'R',
        Ꞅ: 'S',
        Ꞇ: 'T',
        Ꝭ: 'IS',
        Ɉ: 'J',
        Ⱪ: 'K',
        Ꝃ: 'K',
        Ƙ: 'K',
        Ꝁ: 'K',
        Ꝅ: 'K',
        Ƚ: 'L',
        Ⱡ: 'L',
        Ꝉ: 'L',
        Ŀ: 'L',
        Ɫ: 'L',
        ǈ: 'L',
        Ł: 'L',
        Ɱ: 'M',
        Ɲ: 'N',
        Ƞ: 'N',
        ǋ: 'N',
        Ꝋ: 'O',
        Ꝍ: 'O',
        Ɵ: 'O',
        Ø: 'O',
        Ƣ: 'OI',
        Ɛ: 'E',
        Ɔ: 'O',
        Ȣ: 'OU',
        Ꝓ: 'P',
        Ƥ: 'P',
        Ꝕ: 'P',
        Ᵽ: 'P',
        Ꝑ: 'P',
        Ꝙ: 'Q',
        Ꝗ: 'Q',
        Ɍ: 'R',
        Ɽ: 'R',
        Ꜿ: 'C',
        Ǝ: 'E',
        Ⱦ: 'T',
        Ƭ: 'T',
        Ʈ: 'T',
        Ŧ: 'T',
        Ɐ: 'A',
        Ꞁ: 'L',
        Ɯ: 'M',
        Ʌ: 'V',
        Ꝟ: 'V',
        Ʋ: 'V',
        Ⱳ: 'W',
        Ƴ: 'Y',
        Ỿ: 'Y',
        Ɏ: 'Y',
        Ⱬ: 'Z',
        Ȥ: 'Z',
        Ƶ: 'Z',
        Œ: 'OE',
        ᴀ: 'A',
        ᴁ: 'AE',
        ʙ: 'B',
        ᴃ: 'B',
        ᴄ: 'C',
        ᴅ: 'D',
        ᴇ: 'E',
        ꜰ: 'F',
        ɢ: 'G',
        ʛ: 'G',
        ʜ: 'H',
        ɪ: 'I',
        ʁ: 'R',
        ᴊ: 'J',
        ᴋ: 'K',
        ʟ: 'L',
        ᴌ: 'L',
        ᴍ: 'M',
        ɴ: 'N',
        ᴏ: 'O',
        ɶ: 'OE',
        ᴐ: 'O',
        ᴕ: 'OU',
        ᴘ: 'P',
        ʀ: 'R',
        ᴎ: 'N',
        ᴙ: 'R',
        ꜱ: 'S',
        ᴛ: 'T',
        ⱻ: 'E',
        ᴚ: 'R',
        ᴜ: 'U',
        ᴠ: 'V',
        ᴡ: 'W',
        ʏ: 'Y',
        ᴢ: 'Z',
        ᶏ: 'a',
        ẚ: 'a',
        ⱥ: 'a',
        æ: 'ae',
        ꜻ: 'av',
        ɓ: 'b',
        ᵬ: 'b',
        ᶀ: 'b',
        ƀ: 'b',
        ƃ: 'b',
        ɵ: 'o',
        ɕ: 'c',
        ƈ: 'c',
        ȼ: 'c',
        ȡ: 'd',
        ɗ: 'd',
        ᶑ: 'd',
        ᵭ: 'd',
        ᶁ: 'd',
        đ: 'd',
        ɖ: 'd',
        ƌ: 'd',
        ı: 'i',
        ȷ: 'j',
        ɟ: 'j',
        ʄ: 'j',
        ǆ: 'dz',
        ⱸ: 'e',
        ᶒ: 'e',
        ɇ: 'e',
        ꝫ: 'et',
        ƒ: 'f',
        ᵮ: 'f',
        ᶂ: 'f',
        ɠ: 'g',
        ᶃ: 'g',
        ǥ: 'g',
        ⱨ: 'h',
        ɦ: 'h',
        ħ: 'h',
        ƕ: 'hv',
        ᶖ: 'i',
        ɨ: 'i',
        ꝺ: 'd',
        ꝼ: 'f',
        ᵹ: 'g',
        ꞃ: 'r',
        ꞅ: 's',
        ꞇ: 't',
        ꝭ: 'is',
        ʝ: 'j',
        ɉ: 'j',
        ⱪ: 'k',
        ꝃ: 'k',
        ƙ: 'k',
        ᶄ: 'k',
        ꝁ: 'k',
        ꝅ: 'k',
        ƚ: 'l',
        ɬ: 'l',
        ȴ: 'l',
        ⱡ: 'l',
        ꝉ: 'l',
        ŀ: 'l',
        ɫ: 'l',
        ᶅ: 'l',
        ɭ: 'l',
        ł: 'l',
        ſ: 's',
        ẜ: 's',
        ẝ: 's',
        ɱ: 'm',
        ᵯ: 'm',
        ᶆ: 'm',
        ȵ: 'n',
        ɲ: 'n',
        ƞ: 'n',
        ᵰ: 'n',
        ᶇ: 'n',
        ɳ: 'n',
        ꝋ: 'o',
        ꝍ: 'o',
        ⱺ: 'o',
        ø: 'o',
        ƣ: 'oi',
        ɛ: 'e',
        ᶓ: 'e',
        ɔ: 'o',
        ᶗ: 'o',
        ȣ: 'ou',
        ꝓ: 'p',
        ƥ: 'p',
        ᵱ: 'p',
        ᶈ: 'p',
        ꝕ: 'p',
        ᵽ: 'p',
        ꝑ: 'p',
        ꝙ: 'q',
        ʠ: 'q',
        ɋ: 'q',
        ꝗ: 'q',
        ɾ: 'r',
        ᵳ: 'r',
        ɼ: 'r',
        ᵲ: 'r',
        ᶉ: 'r',
        ɍ: 'r',
        ɽ: 'r',
        ↄ: 'c',
        ꜿ: 'c',
        ɘ: 'e',
        ɿ: 'r',
        ʂ: 's',
        ᵴ: 's',
        ᶊ: 's',
        ȿ: 's',
        ɡ: 'g',
        ᴑ: 'o',
        ᴓ: 'o',
        ᴝ: 'u',
        ȶ: 't',
        ⱦ: 't',
        ƭ: 't',
        ᵵ: 't',
        ƫ: 't',
        ʈ: 't',
        ŧ: 't',
        ᵺ: 'th',
        ɐ: 'a',
        ᴂ: 'ae',
        ǝ: 'e',
        ᵷ: 'g',
        ɥ: 'h',
        ʮ: 'h',
        ʯ: 'h',
        ᴉ: 'i',
        ʞ: 'k',
        ꞁ: 'l',
        ɯ: 'm',
        ɰ: 'm',
        ᴔ: 'oe',
        ɹ: 'r',
        ɻ: 'r',
        ɺ: 'r',
        ⱹ: 'r',
        ʇ: 't',
        ʌ: 'v',
        ʍ: 'w',
        ʎ: 'y',
        ᶙ: 'u',
        ᵫ: 'ue',
        ꝸ: 'um',
        ⱴ: 'v',
        ꝟ: 'v',
        ʋ: 'v',
        ᶌ: 'v',
        ⱱ: 'v',
        ⱳ: 'w',
        ᶍ: 'x',
        ƴ: 'y',
        ỿ: 'y',
        ɏ: 'y',
        ʑ: 'z',
        ⱬ: 'z',
        ȥ: 'z',
        ᵶ: 'z',
        ᶎ: 'z',
        ʐ: 'z',
        ƶ: 'z',
        ɀ: 'z',
        œ: 'oe',
        ₓ: 'x'
    };
    const stringWithoutAccents = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    // eslint-disable-next-line no-control-regex
    return stringWithoutAccents.replace(/[^\u0000-\u007E]/g, (character) => unicodeToAsciiMap[character] || '');
}

/**
 * Initializes a target object from another template object by copying all fields from the template that are not
 * in the target object. Only the top-level fields are considered. No merging is performed on deeper levels.
 * @param target The object to which not-yet-existing fields should be copied
 * @param template The object from which the fields should be copied
 * @returns Whether any changes have been made to target.
 */
export function initializeFrom(target: { [key: string]: unknown }, template: { [key: string]: unknown }): boolean {
    let changed = false;
    for (const [k, v] of Object.entries(template)) {
        if (target[k] === undefined) {
            target[k] = v;
            changed = true;
        }
    }
    return changed;
}
