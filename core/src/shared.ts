import { IActorError } from '@darlean/base';
import { formatAllAttributes, replaceArguments } from '@darlean/utils';
import { replaceAll } from '@darlean/utils';

export class ActorError extends Error implements IActorError {
    public code: string;
    parameters?: { [key: string]: unknown };
    nested?: IActorError[];
    stack?: string;

    constructor(code: string, message: string, parameters?: { [key: string]: unknown }, stack?: string) {
        super(code);
        this.code = code;
        this.parameters = parameters ? formatAllAttributes(parameters) : undefined;
        this.message = parameters ? replaceArguments(message, parameters) : message;
        this.stack = stack;
    }
}

export function normalizeActionName(name: string): string {
    return replaceAll(name, '_', '').toLowerCase();
}

export function normalizeActorType(type: string): string {
    return replaceAll(type, '_', '').toLowerCase();
}
