import { Aborter } from "./util";

export interface IPollRequest {
    cancel(): void;
}

interface IPollItem<T> {
    interrupted(value: T): void;
    expired(): void;
}

/**
 * PollController can be used to wait for incoming data.
 * WARMING: In certain situations, events may get lost. For example, when a new event
 * arrives just after a previous wait call finished, and before the next wait call starts.W
 */
export class PollController<T> {
    protected interrupteds: IPollItem<T>[];
    private finalized = false;

    constructor() {
        this.interrupteds = [];
    }

    /**
     * Waits for the next value to arrive. Does not return any previously received values!
     * @param timeout Timeout after which undefined is returned.
     * @param aborter Optional aborter that can be used to manually cancel the waiting.
     * @returns The next value (when available before abortion or timeout) or undefined otherwise.
     */
    public async wait(timeout: number, aborter?: Aborter): Promise<T | undefined> {
        if (this.finalized) {
            return;
        }

        return new Promise((resolve) => {
            const request = this.register(
                timeout,
                (value) => {
                    resolve(value);
                },
                () => {
                    resolve(undefined);
                }
            );

            if (aborter) {
                aborter.handle = () => request.cancel();
            }
        });
    }

    /**
     * Interrupts any waiters with the provided value.
     * The value is not stored internally. So later waiters will *not* receive this value but instead
     * will wait for the next value.
     * @param value 
     */
    public interrupt(value: T) {
        if (this.finalized) {
            return;
        }
        
        const interrupteds = this.interrupteds;
        this.interrupteds = [];
        for (const interrupted of interrupteds) {
            interrupted.interrupted(value);
        }
    }

    /**
     * FInalizes this controller. All pending waiters are invoked with undefined as value. All subsequent
     * attempts to perform waiting will return undefined.
     */
    public finalize() {
        if (this.finalized) {
            return;
        }
        this.finalized = true;

        const interrupteds = this.interrupteds;
        this.interrupteds = [];
        for (const interrupted of interrupteds) {
            interrupted.expired();
        }
    }

    /**
     * Registers a set of 2 functions that are invoked as soon as there is a value (interrupted) or when
     * the timeout expires.
     * Returns an objecty that can be used to cancel the polling.
     */    
    private register(timeout: number, interrupted: (value: T) => void, expired: () => void): IPollRequest {
        const item = {
            interrupted: (value: T) => {
                clearTimeout(timeoutHandle);
                interrupted(value);
            },
            expired: () => {
                clearTimeout(timeoutHandle);
                expired();
            }
        };
        this.interrupteds.push(item);

        const timeoutHandle = setTimeout(() => {
            const idx = this.interrupteds.indexOf(item);
            if (idx >= 0) {
                this.interrupteds.splice(idx, 1);
            }
            expired();
        }, timeout);

        return {
            cancel: () => {
                clearTimeout(timeoutHandle);
                const idx = this.interrupteds.indexOf(item);
                if (idx >= 0) {
                    this.interrupteds.splice(idx, 1);
                }
                expired();
            }
        };
    }    
}
