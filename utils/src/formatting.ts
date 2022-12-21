import { replaceAll } from './util';

export interface IAttributes {
    [key: string]: unknown;
}

function getNestedMessage(error: unknown): string {
    if (typeof error === 'string') {
        return error;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = error as any;
    const parts = [];
    let current = ex;
    while (current) {
        const c = current;
        current = undefined;

        if (typeof c === 'string') {
            parts.push(c);
            break;
        }
        const msg = c.message;
        if (msg && typeof msg === 'string') {
            parts.push(msg);
            const nested = c.nested;
            if (nested && Array.isArray(nested) && nested.length > 0) {
                current = nested[0];
            }
        }
    }
    return parts.join(': ');
}

// eslint-disable-next-line
export function formatAttribute(attribute: any): string {
    if (typeof attribute === 'object' && !Array.isArray(attribute)) {
        const actorType = attribute.actorType;
        const actorId = attribute.actorId;
        const actionName = attribute.actionName;

        if (actorType !== undefined && actorId !== undefined && actionName !== undefined) {
            return `${actorType}${JSON.stringify(actorId)}.${actionName}`;
        }
        if (actorType !== undefined && actorId !== undefined) {
            return `${actorType}${JSON.stringify(actorId)}`;
        }
        if (actorType !== undefined) {
            return actorType;
        }
        if (attribute.code && attribute.message) {
            return `${attribute.code}: ${getNestedMessage(attribute)}`;
        }
        if (attribute.ids && attribute.message) {
            return `${attribute.ids[attribute.ids.length - 1]}: ${getNestedMessage(attribute)}`;
        }
        if (attribute.name && attribute.message) {
            const stack = (attribute.stack as string) || '';

            //if (stack) {
            //  return stack; // Already contains name and message, but not "nested" messages
            //}
            return `${attribute.name}: ${getNestedMessage(attribute)} at ${stack}`;
        }
        return '<object/dict>';
    }
    return JSON.stringify(attribute);
}

export function formatAllAttributes(attributes?: IAttributes): IAttributes | undefined {
    if (!attributes) {
        return;
    }

    const results: IAttributes = {};
    for (const [key, value] of Object.entries(attributes)) {
        results[key] = formatAttribute(value);
    }
    return results;
}

export function replaceArguments(value: string, attributes?: IAttributes, literal = false): string {
    if (!attributes) {
        return value;
    }
    let v = value;
    for (const [key, value] of Object.entries(attributes)) {
        v = replaceAll(v, '[' + key + ']', literal ? (value as string) : formatAttribute(value));
    }
    return v;
}
