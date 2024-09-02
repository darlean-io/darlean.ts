import 'reflect-metadata';

// https://stackoverflow.com/questions/56687668/a-way-to-disable-type-argument-inference-in-generics
// Stop TS from infering the value of T from the provided function arguments.
export type NoInfer<T> = T extends infer U ? U : never;
