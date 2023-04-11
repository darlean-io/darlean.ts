import {
    action,
    IActivatable,
    IDeactivatable,
    IPortal,
    ITablePersistence,
    ITableSearchRequest,
    ITimerCancelOptions,
    ITimerOptions,
    ITimersService,
    ITimerTrigger,
    IVolatileTimer,
    IVolatileTimerHandle,
    timer
} from '@darlean/base';
import { decodeNumber, encodeNumber, ITime } from '@darlean/utils';

export const TIMER_MOMENT_INDEX = 'by-moment';

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

export class TimerActor implements IActivatable, IDeactivatable, ITimersService {
    private persistence: ITablePersistence<ITimerState>;
    private time: ITime;
    private timer: IVolatileTimer;
    private timerHandle?: IVolatileTimerHandle;
    private nextTime?: number;
    private portal: IPortal;

    constructor(persistence: ITablePersistence<ITimerState>, time: ITime, timer: IVolatileTimer, portal: IPortal) {
        this.persistence = persistence;
        this.time = time;
        this.timer = timer;
        this.portal = portal;
    }

    public async activate(): Promise<void> {
        this.timerHandle = this.timer.repeat(this.step, 60 * 1000, 0);
    }

    public async deactivate(): Promise<void> {
        this.timerHandle?.cancel();
    }

    @action({ locking: 'shared' })
    public async schedule(options: ITimerOptions) {
        const newState: ITimerState = {
            id: options.id,
            nextMoment: 0,
            remainingRepeatCount: options.triggers[0].repeatCount ?? 1,
            remainingTriggers: options.triggers.map((x) => ({ ...x })),
            callbackActorType: options.callbackActorType,
            callbackActorId: options.callbackActorId,
            callbackActionName: options.callbackActionName,
            callbackActionArgs: [...(options.callbackActionArgs ?? [])]
        };

        const newMoment = this.updateNextMoment(newState);
        if (!newMoment) {
            throw new Error('Unable to schedule timer');
        }

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

    // When cancelling and a step is performed meanwhile, the cancel can delete the record and the step restore it.
    // To prevent this, make cancel exclusive. We may implement a better (smarter) solution, but for now it is reasonable.

    @action({ locking: 'exclusive' })
    public async cancel(options: ITimerCancelOptions) {
        const item = await this.persistence.load([options.id]);
        if (item.value) {
            item.clear();
            await item.store();
        }
    }

    @action()
    public async touch() {
        //
    }

    @timer({ locking: 'shared' })
    public async step() {
        const now = this.time.machineTime();
        const options: ITableSearchRequest = {
            index: TIMER_MOMENT_INDEX,
            keys: [{ operator: 'lte', value: encodeNumber(now) }]
        };
        for await (const chunk of this.persistence.searchChunks(options)) {
            // We are the only actor that is processing the item (we are a singleton).
            // No need to "reserve" the item; when we fail/crash, another actor will retry
            // (but we are then dead anyways)

            // TODO: Process items in parallel

            for (const item of chunk.items) {
                const currentItem = await this.persistence.load(item.id);
                const currentTimer = currentItem.value;
                if (currentTimer) {
                    let breaking = false;
                    const trigger = currentTimer.remainingTriggers[0];
                    try {
                        // TODO: Invoke callback
                        const actor = this.portal.retrieve(currentTimer.callbackActorType, currentTimer.callbackActorId) as any;
                        await actor[currentTimer.callbackActionName]();

                        if ((trigger?.success ?? 'continue') === 'break') {
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
                if (this.nextTime === undefined || time < this.nextTime) {
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
            this.timerHandle?.resume(Math.min(60 * 1000, remaining));
        }
    }

    private updateNextMoment(state: ITimerState) {
        let trigger = state.remainingTriggers[0];
        const now = this.time.machineTime();
        if (trigger) {
            if (trigger.repeatCount === 0) {
                state.nextMoment = trigger.moment ?? now + (trigger.interval ?? 0);
            } else if (state.remainingRepeatCount > 0) {
                state.remainingRepeatCount--;
                state.nextMoment = trigger.moment ?? now + (trigger.interval ?? 0);
            } else {
                // No more remaining repeats, move to next trigger
                state.remainingTriggers = state.remainingTriggers.slice(1);
                trigger = state.remainingTriggers[0];

                if (trigger) {
                    state.remainingRepeatCount = (trigger.repeatCount ?? 1) - 1;
                    state.nextMoment = trigger.moment ?? now + (trigger.interval ?? 0);
                } else {
                    state.nextMoment = 0;
                    return undefined;
                }
            }
            if (trigger.jitter ?? 0 > 0) {
                const offset = Math.random() * (trigger.jitter ?? 0);
                state.nextMoment += offset;
            }
            return state.nextMoment;
        } else {
            state.nextMoment = 0;
            return undefined;
        }
    }
}
