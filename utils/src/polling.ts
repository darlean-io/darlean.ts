export interface IPollRequest {
    cancel(): void;
}

interface IPollItem<T> {
    interrupted(value: T): void;
    expired(): void;
}

export class PollController<T> {
    protected interrupteds: IPollItem<T>[];

    constructor() {
        this.interrupteds = [];
    }

    public register(timeout: number, interrupted: (value: T) => void, expired: () => void) {
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

    public async wait(timeout: number): Promise<T | undefined> {
        return new Promise((resolve) => {
            this.register(
                timeout,
                (value) => {
                    resolve(value);
                },
                () => {
                    resolve(undefined);
                }
            );
        });
    }

    public interrupt(value: T) {
        const interrupteds = this.interrupteds;
        this.interrupteds = [];
        for (const interrupted of interrupteds) {
            interrupted.interrupted(value);
        }
    }

    public finalize() {
        const interrupteds = this.interrupteds;
        this.interrupteds = [];
        for (const interrupted of interrupteds) {
            interrupted.expired();
        }
    }
}
