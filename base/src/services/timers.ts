/**
 * Actor type for the Timers Service
 */
export const TIMERS_SERVICE = 'io.darlean.TimersService';

export interface ITimerTrigger {
    // Moment (in milliseconds since January 1, 1970 00:00:00 UTC). Either interval or moment should be specified.
    moment?: number;
    // Interval (in milliseconds) since the firing of the previous trigger. Either interval or moment should be specified.
    interval?: number;
    // Allowed amount of jitter (in milliseconds). A random amount of jitter between 0 and the specified jitter is explicitly added
    // to the moment or interval. Note that even in the absense of jitter (or jitter = 0), triggers may fire later than the specified
    // moment or interval.
    jitter?: number;
    // Number of times this trigger will repeat. Set to 0 for indefinately. Default is 1.
    repeatCount?: number;
    // Indicates what should happen when the callback results in an error. Continue with the next trigger, or break the chain.
    error: 'continue' | 'break';
    // Indicates what should happen when the callback is successful. Continue with the next trigger, or break the chain.
    success: 'continue' | 'break';
}

export interface ITimerOptions {
    id: string;
    // Array of moments that the timer should fire
    triggers: ITimerTrigger[];
    callbackActorType: string;
    callbackActorId: string[];
    callbackActionName: string;
    callbackActionArgs?: unknown[];
}

export interface ITimerCancelOptions {
    id: string;
}

export interface ITimersService {
    schedule(options: ITimerOptions): Promise<void>;
    cancel(options: ITimerCancelOptions): Promise<void>;
}
