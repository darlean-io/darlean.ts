import { ITime, ITimer } from './time';
import { performance } from 'perf_hooks';
import { currentScope } from './tracing';
import { Aborter, sleep as util_sleep } from './util';

let debug = false;
const timers: Map<string, boolean> = new Map();

export function debugOpenTimers() {
    debug = true;
}

export function getOpenTimers() {
    return Array.from(timers.keys());
}

export class Time implements ITime {
    stopped: boolean;

    constructor() {
        this.stopped = false;
    }

    public machineTicks(): number {
        return performance.now();
    }

    public machineTime(): number {
        return Date.now();
    }

    public stop(): void {
        this.stopped = true;
    }

    public repeat(callback: () => unknown, name: string, interval: number, delay?: number, repeatCount?: number): ITimer {
        let cancelled = false;
        let nextDelay = delay ?? interval;
        let aborter: Aborter | undefined;
        let repeatsLeft = repeatCount ?? -1;
        let resumeMoment: number | undefined = undefined;
        let cancelDone: () => void | undefined;

        const scope = currentScope();
        setImmediate(async () => {
            if (debug) {
                timers.set(name, true);
            }
            while (!cancelled) {
                aborter = new Aborter();
                await util_sleep(nextDelay, aborter);
                if (!cancelled) {
                    try {
                        await scope.branch('io.darlean.timer-callback', name).perform(callback as () => Promise<unknown>);
                    } catch (e) {
                        scope.error('Error in callback of timer [Name]: [Error]', () => ({
                            Name: name,
                            Error: e
                        }));
                    } finally {
                        if (repeatsLeft === -1 || repeatsLeft > 0) {
                            if (resumeMoment === -1) {
                                // Wait forever
                                nextDelay = 1000 * 1000 * 1000;
                            } else if (resumeMoment === undefined) {
                                nextDelay = interval;
                            } else {
                                nextDelay = resumeMoment - performance.now();
                                if (nextDelay < 0) {
                                    nextDelay = 0;
                                }
                            }
                            if (repeatsLeft > 0) {
                                repeatsLeft--;
                            }
                        } else {
                            cancelled = true;
                        }
                    }
                }
            }
            if (cancelDone) {
                cancelDone();
            }

            cancelled = true;

            if (debug) {
                timers.delete(name);
            }
        });

        return {
            cancel() {
                return new Promise((resolve) => {
                    if (cancelled) {
                        resolve();
                    } else {
                        cancelled = true;
                        cancelDone = resolve;
                        aborter?.abort();
                    }
                });
            },
            pause(duration) {
                if (duration === undefined) {
                    resumeMoment = -1;
                } else {
                    resumeMoment = performance.now() + duration;
                }
            },
            resume(delay) {
                if (delay === undefined) {
                    resumeMoment = performance.now() + interval;
                    aborter?.abort();
                } else {
                    resumeMoment = performance.now() + delay;
                    aborter?.abort();
                }
            }
        };
    }

    public sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    }

    public noop(): Promise<void> {
        return new Promise((resolve) => {
            setImmediate(() => resolve());
        });
    }
}
