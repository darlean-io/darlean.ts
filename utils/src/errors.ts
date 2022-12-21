import { IAttributes, replaceArguments } from './formatting';

// Note: this class deliberately is not an Error because it can also have nested
// errors, and everytime you create such object, NodeJS will assign the current
// stack trace, which is not what we want.

export class DarleanError {
    public code: string;
    public message: string;
    public attributes?: IAttributes;
    public nested?: DarleanError[];
    public stack?: string;

    constructor(code: string, message: string, attributes?: IAttributes, stack?: string, nested?: DarleanError[]) {
        this.message = message ? replaceArguments(message, attributes) : code;
        this.code = code;
        this.attributes = attributes; //formatAllAttributes(attributes);
        this.stack = stack;
        this.nested = nested;
    }

    public tryFindAttribute<T>(name: string): T | undefined {
        const value = this.attributes?.[name] as T;
        if (value === undefined) {
            if (this.nested) {
                for (const n of this.nested) {
                    const nestedValue = n.tryFindAttribute<T>(name);
                    if (nestedValue !== undefined) {
                        return nestedValue;
                    }
                }
            }
        }
        return value;
    }
}

export function ensureDarleanError(e: unknown): DarleanError {
    if (e instanceof DarleanError) {
        return e;
    }

    if (e === undefined) {
        return new DarleanError('ERROR', 'Undefined error');
    }

    if (typeof e === 'string') {
        if (e.includes(' ')) {
            // The exception is a regular text
            return new DarleanError('ERROR', e);
        } else {
            // The exception is a code
            return new DarleanError(e, e);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = e as any;
    const message = ex.message ?? ('no error message' as string);
    const code = ex.code ?? ex.name ?? 'ERROR';
    const attributes = ex.attributes;
    const stack = ex.stack ?? '';
    const nested = ex.nested;

    return new DarleanError(code, message, attributes, stack, nested);
}
