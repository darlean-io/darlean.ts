/* eslint-disable @typescript-eslint/ban-types */
import { IInstanceWrapper } from './instances';

export interface IPersistence<T> {
    load(partitionKey?: string[], sortKey?: string[]): Promise<T | undefined>;
    store(partitionKey: string[] | undefined, sortKey: string[] | undefined, value: T): Promise<void>;
    sub(partitionKey?: string[], sortKey?: string[]): IPersistence<T>;
}

export interface IVolatileTimerHandle {
    cancel(): void;
    pause(duration?: number): void;
    resume(delay?: number): void;
}

export type VolatileTimerFactory<T extends object> = (wrapper: IInstanceWrapper<T>) => IVolatileTimer;

export interface IVolatileTimer {
    once(handler: Function, delay: number, args?: unknown): IVolatileTimerHandle;
    repeat(handler: Function, interval: number, delay?: number, nrRepeats?: number, args?: unknown): IVolatileTimerHandle;
}
