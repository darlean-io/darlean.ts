export interface ITimer {
    /**
     * Cancels the timer. The timer will never fire again. Waits until an eventually running callback
     * function is stopped.
     */
    cancel(): Promise<void>;

    /**
     * Pauses the firing of the timer. When duration is specified, the timer is automatically resumed after
     * the duration. Invoking pause while another pause is already active, or a resume is scheduled, replaces
     * those actions.
     * @param duration When specified, indicates after how many milliseconds the timer will resume. When not specified,
     * the pause lasts indefinately until [[resume]] is explicitly invoked.
     */
    pause(duration?: number): void;

    /**
     * Resumes a paused timer after delay milliseconds. When delay is not present, the timer is resumed after the
     * configured interval of the timer when set, otherwise after the configured initial delay when set, otherwise
     * immediately. When the timer is not paused, the next timer event will be executed after the delay.
     * @param delay The amount of milliseconds after which the timer is resumed.
     */
    resume(delay?: number): void;
}

export interface ITime {
    // Returns the number of milliseconds since some arbitrary moment. Unlike the machineTime method, the machineTicks
    // method is continuous (increments every millisecond by exactly 1), regardless of changes in system time.
    machineTicks(): number;

    // Returns the current time for this machine (computer, virtual machine, container), expressed in milliseconds
    // since January 1, 1970 00:00:00 UTC. (This behaviour is identical to the builtin Date.now function). The
    // machine time may not be continuous (depending on operating system level changes in system time, machine time
    // may jump or move faster or slower than normal).
    machineTime(): number;

    // Invoke callback once after delay milliseconds, and then repeat it for repeatCount times with the provided
    // interval. When interval is negative, or repeatCount is 0, no repetitions are done. When interval is 0, the
    // setImmediate function is used instead of setTimeout. When delay is not provided, the provided interval is
    // used as initial delay. When repeatCount is not present, the callback is repeated indefinately. The initial
    // callback call as well as the subsequent repetitions can be cancelled by means of the 'cancel' method of
    // the returned ITimer instance.
    repeat(callback: () => unknown, name: string, interval: number, delay?: number, repeatCount?: number): ITimer;

    // Sleeps for the specified amount of ms.
    sleep(ms: number): Promise<void>;

    // Sleeps just enough to give timers and asynchronous operations the chance to proceed. This method should be
    // invoked at regular moments during long-running operations to keep the application responsive.
    noop(): Promise<void>;
}
