export interface IActorError {
    code: string;
    message: string;
    parameters?: { [key: string]: unknown };
    nested?: IActorError[];
    stack?: string;
}

export interface IActorCallRequest {
    actorType: string;
    actorId: string[];
    actionName: string;
    arguments: unknown[];
}

export interface IActorCallResponse {
    result?: unknown;
    error?: IActorError;
}

export interface IInvokeOptions {
    destination: string;
    content: unknown;
}

export interface IInvokeResult {
    errorCode?: string;
    errorParameters?: { [key: string]: unknown };
    content?: unknown;
}

export interface IInvokeAttempt {
    options?: IInvokeOptions;
    result: IInvokeResult;
    requestTime: string;
}

export class InvokeError extends Error {
    attempts: IInvokeAttempt[];

    constructor(message: string, attempts: IInvokeAttempt[]) {
        super(message);
        this.attempts = attempts;
    }
}
