/**
 * Represents an error that occured in the user code of a local or remote action method.
 */
export interface IActorError {
    /**
     * String code that should uniquely represent this particular error.
     *
     * @remarks Errors that occur outside of user code (like network errors, actor
     * not registered, et cetera) are reported by means of an {@link InvokeError}. This
     * allows an application to distinguish between errors in the user code and errors
     * by the framework.
     *
     * @see {@link toActorError} for how `code` is filled in for various typescript error types.
     */
    code: string;

    /**
     * Error message. Can contain `[Foo]` placeholders that are replaced with the corresponding
     * value in the `parameters` map when displaying the error message.
     */
    message: string;

    /**
     * List of key-value pairs that provide additional context to the error.
     */
    parameters?: { [key: string]: unknown };

    /**
     * Optional list of nested errors. Nested errors are errors that cause this error to occur.
     */
    nested?: IActorError[];

    /**
     * Optional stack trace
     */
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

/**
 * Represents a framework error during invocation of a remote actor.
 */
export class InvokeError extends Error {
    attempts: IInvokeAttempt[];

    constructor(message: string, attempts: IInvokeAttempt[]) {
        super(message);
        this.attempts = attempts;
    }
}
