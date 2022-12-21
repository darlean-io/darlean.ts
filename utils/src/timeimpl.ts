import { ITime, ITimer } from './time';
import { performance } from 'perf_hooks';
import { currentScope } from './logging';

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

        const f = async () => {
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
                            handle = interval === 0 ? setImmediate(f) : setTimeout(f, interval);
                            haveImmediate = interval === 0;
                            if (repeatsLeft !== undefined) {
                                repeatsLeft--;
                            }
                        } else {
                            handle = undefined;
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

        handle = setTimeout(f, delay ?? interval);

        return {
            cancel: () => {
                outerScope.deep('Cancelling timer [Name] with handle [HasHandle]', () => ({
                    Name: name,
                    HasHandle: !!handle
                }));
                if (handle) {
                    if (haveImmediate) {
                        clearImmediate(handle as NodeJS.Immediate);
                    } else {
                        clearTimeout(handle as NodeJS.Timeout);
                    }
                }
                handle = undefined;
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
                    if (haveImmediate) {
                        clearImmediate(handle as NodeJS.Immediate);
                    } else {
                        clearTimeout(handle as NodeJS.Timeout);
                    }
                }
                handle = undefined;
                if (duration !== undefined) {
                    handle = duration === 0 ? setImmediate(f) : setTimeout(f, duration);
                    haveImmediate = duration === 0;
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
                if (haveImmediate) {
                    clearImmediate(handle as NodeJS.Immediate);
                } else {
                    clearTimeout(handle as NodeJS.Timeout);
                }
                const d = resumeDelay ?? interval ?? delay ?? 0;
                handle = d === 0 ? setImmediate(f) : setTimeout(f, d);
                haveImmediate = d === 0;
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
