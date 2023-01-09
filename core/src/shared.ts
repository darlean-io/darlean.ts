import { ActionErrorKind, IActionError } from '@darlean/base';
import { formatAllAttributes, replaceArguments } from '@darlean/utils';
import { replaceAll } from '@darlean/utils';

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
    public template: string;

    constructor(
        code: string,
        template: string,
        parameters?: { [key: string]: unknown },
        stack?: string,
        nested?: IActionError[]
    ) {
        super(code);
        this.kind = 'application';
        this.code = code;
        this.parameters = parameters ? formatAllAttributes(parameters) : undefined;
        this.template = template;
        this.message = parameters ? replaceArguments(template, parameters) : template;
        this.stack = stack;
        this.nested = nested;
    }
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
    public template: string;

    constructor(
        code: string,
        template: string,
        parameters?: { [key: string]: unknown },
        stack?: string,
        nested?: IActionError[]
    ) {
        super(code);
        this.kind = 'framework';
        this.code = code;
        this.parameters = parameters ? formatAllAttributes(parameters) : undefined;
        this.template = template;
        this.message = parameters ? replaceArguments(template, parameters) : template;
        this.stack = stack;
        this.nested = nested;
    }
}

/**
 * Normalizes an action name for cross-language use. Removes all characters except for
 * a-z, A-Z and 0-9, and converts the resulting value into lowercase.
 * @param name The unnormalized name of the action
 * @returns The normalized action name
 * @remarks Due to the nature of the normalization, casing or use of special characters
 * should not be used to discriminate between two otherwise identical action names. For
 * example, do not define two actions named `makeWarmer` and `makewarmer` on the same actor,
 * because both will normalize to `makewarmer`, which is not allowed.
 */
export function normalizeActionName(name: string): string {
    return replaceAll(name, '_', '').toLowerCase();
}

/**
 * Normalizes an actor type for cross-language use. Removes all characters except for
 * `a-z`, `A-Z`, `0-9` and `.`, and converts the resulting value into lowercase.
 * @param name The unnormalized actor type
 * @returns The normalized actor type
 * @remarks Due to the nature of the normalization, casing or use of special characters
 * should not be used to discriminate between two otherwise identical actor typess. For
 * example, do not define two actors with type `temperatureActor` and `TemperatureActor`,
 * because both will normalize to `temperatureactor`, which is not allowed.
 */
export function normalizeActorType(type: string): string {
    return replaceAll(type, '_', '').toLowerCase();
}
