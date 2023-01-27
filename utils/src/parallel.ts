import { currentScope } from "./tracing";

export interface ITasksResult<TaskResult, FinalResult> {
    results: ITaskResult<TaskResult>[];
    result?: FinalResult;
    status: 'completed' | 'timeout' | 'aborted';
}

export interface ITaskResult<Result> {
    done: boolean;
    result?: Result;
    error?: unknown;
}

export type ParallelAbort<FinalResult> = (finalResult?: FinalResult) => void;
export type ParallelTask<TaskResult, FinalResult> = (abort: ParallelAbort<FinalResult>) => Promise<TaskResult>;

/**
 *
 * Execute a list of tasks in parallel, with an optional timeout. Tasks can decide to
 * abort the parallel processing early. They can then also specify a 'final result'
 * value that is then returned as part of the result.
 */
export async function parallel<TaskResult, FinalResult>(
    tasks: Array<ParallelTask<TaskResult, FinalResult>>,
    timeout: number,
    maxConcurrency?: number
): Promise<ITasksResult<TaskResult, FinalResult>> {
    return new Promise((resolve) => {
        if (tasks.length === 0) {
            resolve({
                results: [],
                status: 'completed'
            });
            return;
        }

        const results: ITasksResult<TaskResult, FinalResult> = {
            results: new Array(tasks.length),
            status: 'completed'
        };

        let open = tasks.length;
        let idx = 0;
        let abort = false;
        let done = false;
        let nrunning = 0;
        const nextTick = (maxConcurrency ?? 0) < 0;
        maxConcurrency = maxConcurrency === undefined ? undefined : Math.abs(maxConcurrency);

        let timer: NodeJS.Timeout | undefined;
        if (timeout > 0) {
            timer = setTimeout(() => {
                if (!done) {
                    results.status = 'timeout';
                    done = true;
                    resolve(results);
                }
            }, timeout);
        }

        function closeOneTask() {
            open--;
            nrunning--;
            if (abort || open === 0) {
                if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                done = true;
                resolve(results);
            }
            if (nextTick) {
                process.nextTick(() => processMore());
            } else {
                setImmediate(() => processMore());
            }
        }

        function processMore() {
            while (idx < tasks.length) {
                if (maxConcurrency === undefined || nrunning < maxConcurrency) {
                    const task = tasks[idx];
                    const result = results.results[idx];
                    try {
                        nrunning++;
                        const idxString = idx.toString();
                        process.nextTick( async () => {
                            await currentScope().branch('io.darlean.parallel', idxString).perform( async () => {
                                try {
                                    const value = await task(
                                        /*abort*/ (finalResult) => {
                                            if (done) {
                                                return;
                                            }
                                            results.result = finalResult;
                                            results.status = 'aborted';
                                            abort = true;
                                        }
                                    );
    
                                    if (done) {
                                        return;
                                    }
                                    result.result = value;
                                    result.done = true;
                                    closeOneTask();
                                } catch(e) {
                                    if (done) {
                                        return;
                                    }
                                    result.error = e;
                                    result.done = true;
                                    closeOneTask();
                                }    
                            });
                        });
                    } catch (e) {
                        if (done) {
                            return;
                        }
                        result.error = e;
                        closeOneTask();
                    }
                    idx++;
                } else {
                    break;
                }
            }
        }

        for (let idx = 0; idx < tasks.length; idx++) {
            const result: ITaskResult<TaskResult> = { done: false };
            results.results[idx] = result;
        }

        process.nextTick(() => processMore());
    });
}
