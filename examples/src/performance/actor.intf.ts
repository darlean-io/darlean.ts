export interface IPerformanceActor {
    add(amount: number, sleep: number): Promise<number>;
    get(): Promise<number>;
}

export const PERFORMANCE_ACTOR = 'PerformanceActor';
