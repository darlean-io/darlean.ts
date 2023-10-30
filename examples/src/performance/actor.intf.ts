export interface IPerformanceActor {
    add(amount: number, sleep: number): Promise<number>;
    addPure(amount: number): Promise<number>;
    get(): Promise<number>;
}

export const PERFORMANCE_ACTOR_STATIC = 'PerformanceActorStatic';
export const PERFORMANCE_ACTOR_VIRTUAL = 'PerformanceActorVirtual';
