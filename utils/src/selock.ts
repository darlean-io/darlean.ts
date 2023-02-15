/**
 * Provides a [[SharedExclusiveLock]] implementation with support for reentrancy and take over.
 *
 * @module
 */

/**
 * @internal
 */
interface IPendingRequest {
    tokens: string[];
    token: string;
    kind: 'shared' | 'exclusive' | 'takeover';
    resolve?: () => void;
    reject?: (reason?: unknown) => void;
}

/**
 * Provides a shared-exclusive lock (aka multi-read-exclusive-write lock) with support for reentrancy.
 * It provides support for shared locks (multiple callers can have a shared lock at the same time) and
 * exclusive locks (exclusive locks can only be obtained when there are no shared locks active, and at
 * most one exclusive lock can be active at any moment, with the exception of reentrant exclusive locks
 * of which multiple can be active at the same time, but all for the same reentrancy-tree).
 *
 * In addition to that, it provides and the ability to take over the lock. Once taken over, no more
 * shared and/or exclusive locks are ever granted, except for reentrant lock requests that originate
 * from the take-over lock.
 */
export class SharedExclusiveLock {
    protected pendingShareds: IPendingRequest[];
    protected pendingExclusives: IPendingRequest[];
    protected pendingTakeOver?: () => void;
    protected exclusiveTokens: string[];
    // Each shared lock holder has one entry in this array
    protected sharedTokens: string[];
    protected priority: 'shared' | 'exclusive';
    protected disabled: boolean;

    /**
     * Creates a new shared-exclusive lock instance.
     * @param priority Indicates whether shared lock requests or exclusive lock requests
     * are handled first.
     */
    constructor(priority: 'shared' | 'exclusive') {
        this.pendingShareds = [];
        this.pendingExclusives = [];
        this.exclusiveTokens = [];
        this.sharedTokens = [];
        this.priority = priority;
        this.disabled = false;
    }

    /**
     * Tries to obtain a shared lock, and return immediately when this is not immediately
     * possible. See [[beginShared]].
     * @returns True when the shared lock was granted, False otherwise. Throws `'TAKEN_OVER'` when
     * the lock has been taken over.
     */
    public tryBeginShared(token: string, _reentrancyTokens?: string[]): boolean {
        if (this.disabled) {
            throw new Error('TAKEN_OVER');
        }

        if (this.exclusiveTokens.length === 0 && this.sharedTokens.length === 0) {
            this.sharedTokens.push(token);
            return true;
        }

        return false;
    }

    /**
     * Begin a shared lock, and wait until it is granted. A shared lock is granted
     * when no exclusive lock is active and when the lock is not taken over. It is
     * also granted when an exclusive lock is active, or when the lock is taken over,
     * but when at least one of the provided reentrancyTokens matches with the token
     * of the active exclusive or takeover lock.
     * @param token The token that uniquely identifies this lock request
     * @param reentrencyTokens The tokens that are used to check reentrancy.
     * @returns Void when the lock is granted, or throws `'TAKEN_OVER'` when the lock is taken over
     * while waiting.
     */
    public async beginShared(token: string, reentrancyTokens?: string[]): Promise<void> {
        const p = new Promise<void>((resolve, reject) => {
            this.pendingShareds.push({ token, tokens: reentrancyTokens ?? [], kind: 'shared', resolve, reject });
            this.tryProcessStep();
        });
        return p;
    }

    /**
     * Ends a shared lock. This method must be invoked exactly once for every corresponding call
     * to [[beginShared]].
     * @param token The token as passed before to the corresponding call to [[beginShared]].
     */
    public endShared(token: string): void {
        const idx = this.sharedTokens.indexOf(token);
        if (idx >= 0) {
            this.sharedTokens.splice(idx, 1);
        } else {
            throw new Error(`Token ${token} for shared lock not found while trying to end shared lock`);
        }
        this.tryProcessStep();
    }

    /**
     * Tries to obtain an exclusive lock, and return immediately when this is not immediately
     * possible. See [[beginExclusive]].
     * @returns True when the exclusive lock was granted, False otherwise. Throws `'TAKEN_OVER'` when
     * the lock is taken over.
     */
    public tryBeginExclusive(token: string, _reentrancyTokens?: string[]): boolean {
        if (this.disabled) {
            throw new Error('TAKEN_OVER');
        }

        if (this.exclusiveTokens.length === 0 && this.sharedTokens.length === 0) {
            this.exclusiveTokens.push(token);
            return true;
        }

        return false;
    }

    /**
     * Begin an exclusive lock, and wait until it is granted. An exclusive lock is granted
     * when no shared locks are active and when the lock is not taken over. It is
     * also granted when an other exclusive lock is active, or when the lock is taken over,
     * and when at least one of the provided reentrancyTokens matches with the token
     * of the active exclusive or takeover lock.
     *
     * Trying to upgrade an existing shareded lock to an exclusive lock is considered an error
     * as it can lead to deadlock situations when two callers try to to the same trick at the
     * same moment. So, when an exclusive lock is tried to be obtained while another shared lock
     * that matches one of the exclusive locks reentrancyTokens is already active, an error is thrown.
     * @param token The token that uniquely identifies this lock request
     * @param reentrencyTokens The tokens that are used to check reentrancy.
     * @returns Void when the lock is granted, or throws `'TAKEN_OVER'` when the lock is taken over
     * while waiting or `'NO_UPGRADE'` when the caller tries to upgrade a shared lock to an exclusive lock.
     */
    public async beginExclusive(token: string, reentrancyTokens?: string[]): Promise<void> {
        const p = new Promise<void>((resolve, reject) => {
            this.pendingExclusives.push({ token, tokens: reentrancyTokens ?? [], kind: 'exclusive', resolve, reject });
            this.tryProcessStep();
        });
        return p;
    }

    public endExclusive(token: string): void {
        const idx = this.exclusiveTokens.indexOf(token);
        if (idx >= 0) {
            this.exclusiveTokens.splice(idx, 1);
        } else {
            throw new Error(`Token ${token} for exclusive lock not found while trying to end exclusive lock`);
        }
        this.tryProcessStep();
    }

    /**
     * Takes over the lock. Effecively, it adds a new exclusive lock request to the top of the
     * internal lock request queue, and changes the lock priority to 'exclusive'. Once taken
     * over, it cannot be undone. During take over, reentrant locks are still allowed. After the
     * take over logic is finished, the caller should call [[finalize]] to reject all pending
     * locks.
     */
    public async takeOver(token: string): Promise<void> {
        const p = new Promise<void>((resolve, reject) => {
            this.pendingExclusives = [{ token, tokens: [token], kind: 'takeover', resolve, reject } as IPendingRequest].concat(
                this.pendingExclusives
            );
            this.priority = 'exclusive';
            this.tryProcessStep();
        });
        return p;
    }

    /**
     * Rejects all pending locks.
     */
    public async finalize(): Promise<void> {
        this.disabled = true;
        for (const shared of this.pendingShareds) {
            if (shared.reject) {
                shared.reject(new Error('TAKEN_OVER'));
            }
        }
        this.pendingShareds = [];
        for (const exclusive of this.pendingExclusives) {
            if (exclusive.reject) {
                exclusive.reject(new Error('TAKEN_OVER'));
            }
        }
        this.pendingExclusives = [];
    }

    protected tryProcessStep(): boolean {
        let acquired = false;
        if (this.disabled) {
            throw new Error('TAKEN_OVER');
        }

        const pending =
            this.priority === 'shared'
                ? this.pendingShareds.concat(this.pendingExclusives)
                : this.pendingExclusives.concat(this.pendingShareds);

        if (pending.length > 0) {
            this.pendingShareds = [];
            this.pendingExclusives = [];

            for (const request of pending) {
                if (request.kind === 'shared') {
                    const haveExclusiveLock = this.exclusiveTokens.length > 0;
                    const havePendingExclusiveLocks = this.pendingExclusives.length > 0;
                    const compatible = inBoth(request.tokens, this.exclusiveTokens) || inBoth(request.tokens, this.sharedTokens);
                    const acceptable = !haveExclusiveLock || compatible;
                    const mustWait =
                        this.priority === 'exclusive' &&
                        havePendingExclusiveLocks &&
                        (request.tokens.length === 0 || !compatible);

                    if (acceptable && !mustWait) {
                        this.sharedTokens.push(request.token);
                        if (request.resolve) {
                            request.resolve();
                            acquired = true;
                        }
                    } else {
                        this.pendingShareds.push(request);
                    }
                } else {
                    // We have an exclusive lock request.
                    const compatible = inBoth(this.exclusiveTokens, request.tokens);
                    if (compatible || this.exclusiveTokens.length + this.sharedTokens.length === 0) {
                        this.exclusiveTokens.push(request.token);
                        if (request.resolve) {
                            request.resolve();
                        }
                        acquired = true;
                    } else {
                        let rejected = false;
                        for (const shared of this.sharedTokens) {
                            if (request.tokens.includes(shared)) {
                                rejected = true;
                                if (request.reject) {
                                    request.reject('NO_UPGRADE');
                                }
                                break;
                            }
                        }

                        if (!rejected) {
                            this.pendingExclusives.push(request);
                        }
                    }
                }
            }
        }
        return acquired;
    }
}

function inBoth(a: string[], b: string[]) {
    for (const aa of a) {
        if (b.includes(aa)) {
            return true;
        }
    }
    return false;
}
