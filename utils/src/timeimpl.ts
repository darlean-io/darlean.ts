import { ITime, ITimer } from './time';
import { performance } from 'perf_hooks';
import { currentScope } from './logging';

let debug = false;
const timers: Map<string, boolean> = new Map();

export function debugOpenTimers(interval: number) {
    debug = true;

    setInterval(() => {
        console.log('TIMERS:', Array.from(timers.keys()).join(', '));
    }, interval);
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
        let handle: NodeJS.Timeout | NodeJS.Immediate | undefined;
        let repeatsLeft = repeatCount;
        let haveImmediate = false;
        let cancelled = false;
        let paused = false;
        const outerScope = currentScope();

        function start(f: () => void, d: number) {
            handle = d === 0 ? setImmediate(f) : setTimeout(f, d);
            haveImmediate = d === 0;
            if (debug) {
                timers.set(name, true);
            }
        }

        function stopped() {
            handle = undefined;
        }

        function clear() {
            if (haveImmediate) {
                clearImmediate(handle as NodeJS.Immediate);
            } else {
                clearTimeout(handle as NodeJS.Timeout);
            }
        }

        const f = async () => {
            if (debug) {
                timers.delete(name);
            }

            const scope = currentScope();
            scope.deep('F HANDLE [Name] [Handle]', () => ({ Name: name, Handle: handle }));
            paused = false;
            if (handle) {
                try {
                    if (this.stopped) {
                        scope.error('Timer [Name] fired after stop', () => ({ Name: name }));
                    }
                    await callback();
                } catch (e) {
                    scope.error('Error while processing timer [Name]: [Error]', () => ({ Name: name, Error: e }));
                } finally {
                    if (handle !== undefined) {
                        if (interval >= 0 && (repeatsLeft === undefined || repeatsLeft > 0)) {
                            start(f, interval);
                            if (repeatsLeft !== undefined) {
                                repeatsLeft--;
                            }
                        } else {
                            stopped();
                        }
                    }
                }
            }
        };

        outerScope.deep(
            'Setting timer [Name] with interval [Interval], initial delay [Delay] and repeat count [RepeatCount]',
            () => ({
                Name: name,
                Interval: interval,
                Delay: delay,
                RepeatCount: repeatCount
            })
        );

        start(f, delay ?? interval);

        return {
            cancel: () => {
                outerScope.deep('Cancelling timer [Name] with handle [HasHandle]', () => ({
                    Name: name,
                    HasHandle: !!handle
                }));
                if (handle) {
                    clear();
                }
                stopped();
                cancelled = true;
            },
            pause: (duration?: number) => {
                if (cancelled) {
                    return;
                }
                outerScope.deep('Pausing timer [Name] with handle [HasHandle] for [Duration]', () => ({
                    Name: name,
                    HasHandle: !!handle,
                    Duration: duration
                }));
                if (handle) {
                    clear();
                }
                stopped();
                if (duration !== undefined) {
                    start(f, duration);
                }
                paused = true;
            },
            resume: (resumeDelay?: number) => {
                if (cancelled) {
                    return;
                }
                if (!paused) {
                    return;
                }
                clear();
                const d = resumeDelay ?? interval ?? delay ?? 0;
                start(f, d);
            }
        };
    }

    public sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), ms);
        });
    }

    public noop(): Promise<void> {
        return new Promise((resolve) => {
            setImmediate(() => resolve());
        });
    }
}
