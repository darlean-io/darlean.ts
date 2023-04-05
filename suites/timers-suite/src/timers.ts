import { action, IActivatable, ITablePersistence, ITableSearchRequest, IVolatileTimer, IVolatileTimerHandle, timer } from "@darlean/base";
import { decodeNumber, encodeNumber, ITime } from "@darlean/utils";

export const TIMER_MOMENT_INDEX = 'by-moment';

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

export interface ITimerState {
    id: string;
    nextMoment: number;
    remainingTriggers: ITimerTrigger[];
    // Remaining repeat count for the current trigger
    remainingRepeatCount: number;
    callbackActorType: string;
    callbackActorId: string[];
    callbackActionName: string;
    callbackActionArgs?: unknown[];
}


// TODO: Handle re-checking when actor is deactivated

export class TimerActor implements IActivatable {
    private persistence: ITablePersistence<ITimerState>;
    private time: ITime;
    private timer: IVolatileTimer;
    private timerHandle?: IVolatileTimerHandle;
    private nextTime?: number;


    constructor(persistence: ITablePersistence<ITimerState>, time: ITime, timer: IVolatileTimer) {
        this.persistence = persistence;
        this.time = time;
        this.timer = timer;
    }

    public async activate(): Promise<void> {
        this.timerHandle = this.timer.repeat(this.step, 60*1000);
    }

    @action({locking: 'shared'})
    public async schedule(options: ITimerOptions) {
        const newState: ITimerState = {
            id: options.id,
            nextMoment: 0,
            remainingRepeatCount: options.triggers[0].repeatCount ?? 1,
            remainingTriggers: options.triggers.map((x) => ({...x})),
            callbackActorType: options.callbackActorType,
            callbackActorId: options.callbackActorId,
            callbackActionName: options.callbackActionName,
            callbackActionArgs: [...options.callbackActionArgs ?? []]
        };

        newState.nextMoment = this.extractFirstMoment(newState);

        const item = await this.persistence.load([newState.id]);
        item.change(newState);
        await item.store();

        if (this.nextTime !== undefined) {
            if (newState.nextMoment <= this.nextTime) {
                this.nextTime = newState.nextMoment;
                this.trigger();
            }
        } else {
            this.nextTime = newState.nextMoment;
            this.trigger();
        }
    }

    @action()
    public async touch() {
        //
    }

    @timer({locking: 'shared'})
    public async step() {
        const now = this.time.machineTime();
        const options: ITableSearchRequest = {
            index: TIMER_MOMENT_INDEX,
            keys: [{operator: 'lte', value: encodeNumber(now)}]
        };
        for await (const chunk of this.persistence.searchChunks(options)) {
            // We are the only actor that is processing the item (we are a singleton).
            // No need to "reserve" the item; when we fail/crash, another actor will retry
            // (but we are then dead anyways)

            for (const item of chunk.items) {
                const currentItem = await this.persistence.load(item.id);
                const currentTimer = currentItem.value;
                if (currentTimer) {
                    let breaking = false;
                    const trigger = currentTimer.remainingTriggers[0];
                    try {
                          // TODO: Invoke callback

                        if ((trigger?.error ?? 'continue') === 'break') {
                            breaking = true;
                        }
                    } catch (e) {
                        if ((trigger?.error ?? 'continue') === 'break') {
                            breaking = true;
                        }
                    } finally {
                        if (!breaking) {
                            const newMoment = this.updateNextMoment(currentTimer);
                            if (newMoment === undefined) {
                                breaking = true;
                            }
                        }

                        if (breaking) {
                            currentItem.clear();
                        }

                        await currentItem.store(true);
                    }
                }
            }

            if (chunk.items.length > 0) {
                // When we did process some items, do not continue with next chunk (because new items may have come in between)
                // but redo the entire step.
                if (chunk.continuationToken) {
                    this.timerHandle?.resume(0);
                    return;
                }
                
                break;
            }
        }

        this.nextTime = undefined;
        // Note: In between, parallel requests to 'schedule' may adjust nextTime
        const options2: ITableSearchRequest = {
            index: TIMER_MOMENT_INDEX,
            maxItems: 1
        };
        
        for await (const item of this.persistence.searchItems(options2)) {
            if (item.keys?.[0]) {
                const time = decodeNumber(item.keys[0]);
                if ((this.nextTime === undefined) || (time < this.nextTime)) {
                    this.nextTime = time;
                    this.trigger();
                }
            }
            break;
        }
    }

    private trigger() {
        if (this.nextTime) {
            const now = this.time.machineTime();
            const remaining = Math.max(0, this.nextTime - now);
            this.timerHandle?.resume(Math.min(60*1000, remaining));
        }
    }

    protected updateNextMoment(state: ITimerState) {
        const trigger = state.remainingTriggers[0];
        const now = this.time.machineTime();
        if (trigger) {
            if (trigger.repeatCount === 0) {
                state.nextMoment = trigger.moment ?? now + (trigger.interval ?? 0);
            } else
            if (state.remainingRepeatCount > 0) {
                state.remainingRepeatCount--;
                state.nextMoment = trigger.moment ?? now + (trigger.interval ?? 0);
            } else {
                // No more remaining repeats, move to next trigger
                state.remainingTriggers = state.remainingTriggers.slice(1);
                if (state.remainingTriggers.length > 0) {
                    state.remainingRepeatCount = state.remainingTriggers[0].repeatCount ?? 1;
                    state.nextMoment = state.remainingTriggers[0].moment ?? now + (state.remainingTriggers[0].interval ?? 0);
                } else {
                    state.nextMoment = 0;
                    return undefined;
                }
            }
        } else {
            state.nextMoment = 0;
            return undefined;
        }
    }

    protected extractFirstMoment(state: ITimerState) {
        const trigger = state.remainingTriggers[0];
        if (!trigger) {
            return this.time.machineTime();
        }

        let moment = trigger.moment ?? this.time.machineTime() + (trigger.interval ?? 0);
        if (trigger.jitter ?? 0 > 0) {
            const offset = Math.random() * (trigger.jitter ?? 0);
            moment += offset;
        }

        return moment;
    }
}