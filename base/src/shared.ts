import { Aborter, replaceArguments } from '@darlean/utils';

/**
 * The kind of error.
 *
 * * `application`: The error is caused by application code
 * * `framework`: The error is caused by the Darlean framework
 */
export type ActionErrorKind = 'framework' | 'application';

/**
 * Represents an error that occured during the performing of an action, either in framework code (for example, when a remote application
 * could not be reached) or in the application code that forms the actual implementation of the action.
 *
 * The value of `kind` indicates whether the error
 * is caused by the framework or the application, and can be used to discriminate between these situations.
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
    template?: string;

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

/**
 * The request for invoking a remote action at the "remote" level.
 *
 * @see {@link IInvokeOptions} for the counterpart of this interface on the "transport" level.
 */
export interface IActorCallRequest {
    /**
     * The *normalized* actor type on which a remote action should be invoked
     *
     * @see {@link normalizeActorType}
     */
    actorType: string;

    /**
     * The id of the actor on which the remote action should be invoked
     */
    actorId: string[];

    /**
     * The *normalized* action name that should be invoked
     *
     * @see {@link normalizeActionName}
     */
    actionName: string;

    /**
     * Any arguments that should be passed to the remote action implementation
     */
    arguments: unknown[];
}

/**
 * The response of invoking a remote action at the "remote" level.
 *
 * @see {@link IInvokeResult} for the counterpart of this interface on the "transport" level.
 */
export interface IActorCallResponse {
    /**
     * The result value from the invoked action (when there is no {@link IActorCallResponse.error})
     */
    result?: unknown;

    /**
     * When present, indicates that an error occurred in framework or application code
     * (indocated by the value of {@link IActionError.kind}).
     */
    error?: IActionError;
}

/**
 * The options for invoking a remote action at the "transport" level.
 */
export interface IInvokeOptions {
    /**
     * The name of the application that should invoke the remote action
     */
    destination: string;
    /**
     * The actual contents of the action invoke request.
     *
     * @remarks This currently always is an instance of {@link IActorCallRequest}.
     */
    content: unknown;
    /**
     * An optional {@link Aborter} instance that application code can use to abort the invoke operation.
     */
    aborter?: Aborter;
}

/**
 * The results of invoking a remote action at the "transport" level.
 */
export interface IInvokeResult {
    /**
     * An optional error code for transport errors.
     */
    errorCode?: string;
    /**
     * An optional map of error parameters.
     *
     * @see {@link TRANSPORT_ERROR_PARAMETER_MESSAGE}
     */
    errorParameters?: { [key: string]: unknown };

    /**
     * The content of the response (when there is no error).
     *
     * @remarks THis currently always is an instance of {@link IActorCallResponse}.
     */
    content?: unknown;
}

/**
 * Implementation of an {@link IActionError} that occurred in application code while
 * performing an action on an actor.
 */
export class ApplicationError extends Error implements IActionError {
    public code: string;
    public parameters?: { [key: string]: unknown };
    public nested?: IActionError[];
    public stack?: string;
    public kind: ActionErrorKind;
    public template?: string;

    constructor(
        code: string,
        template?: string,
        parameters?: { [key: string]: unknown },
        stack?: string,
        nested?: IActionError[],
        message?: string
    ) {
        super(code);
        this.kind = 'application';
        this.code = code;
        this.parameters = parameters; // ? formatAllAttributes(parameters) : undefined;
        this.template = template;
        if (template === undefined) {
            this.message = message ?? code;
        } else {
            this.message = parameters ? replaceArguments(template, parameters) : template;
        }
        if (haveStack(stack)) {
            this.stack = stack;
        }
        this.nested = nested;
    }
}

// Stack traces always contain the error message + additional stack lines.
// When only error msg is present, we do not consider it a real stack trace. We want
// to have node derive a new stack trace instead.
function haveStack(stack?: string) {
    return stack?.includes('\n');
}

/**
 * Implementation of an {@link IActionError} that occurred in Darlean framework code while
 * performing or trying to perform an action on an actor.
 */
export class FrameworkError extends Error implements IActionError {
    public code: string;
    public parameters?: { [key: string]: unknown };
    public nested?: IActionError[];
    public stack?: string;
    public kind: ActionErrorKind;
    public template?: string;

    constructor(
        code: string,
        template?: string,
        parameters?: { [key: string]: unknown },
        stack?: string,
        nested?: IActionError[],
        message?: string
    ) {
        super(code);
        this.kind = 'framework';
        this.code = code;
        this.parameters = parameters; // ? formatAllAttributes(parameters) : undefined;
        this.template = template;
        if (template === undefined) {
            this.message = message ?? code;
        } else {
            this.message = parameters ? replaceArguments(template, parameters) : template;
        }
        if (haveStack(stack)) {
            this.stack = stack;
        }
        this.nested = nested;
    }
}
