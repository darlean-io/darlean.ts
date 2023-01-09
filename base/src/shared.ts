export type ActionErrorKind = 'framework' | 'application';

/**
 * Represents an error that occured during the performing of an action, either in framework code (for example, when a remote application
 * could not be reached) or in the application code that forms the actual implementation of the action. The value of `kind` indicates whether the error
 * is caused by the framework or the application, and can be used to decriminate between these situations.
 */
export interface IActionError {
    /**
     * String code that should uniquely represent this particular error.
     *
     * @see {@link toActorError} for how `code` is filled in for various typescript error types.
     */
    code: string;

    /**
     * Error message that has all `[Foo]` placeholders in the template replaced by their corresponding
     * value in the `parameters` map.
     */
    message: string;

    /**
     * Raw template used to form the error message. The `[Foo]` placeholders are still present (they are not
     * yet replaced by their corresponding value in the `parameters` map).
     */
    template: string;

    /**
     * Indicates whether this error is a `framework` or `application` error.
     */
    kind: ActionErrorKind;

    /**
     * List of key-value pairs that provide additional context to the error.
     */
    parameters?: { [key: string]: unknown };

    /**
     * Optional list of nested errors. Nested errors are errors that cause this error to occur.
     */
    nested?: IActionError[];

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
    error?: IActionError;
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
