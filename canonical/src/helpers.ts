import { CanonicalLike, ICanonical, ICanonicalSource } from './canonical';

export function toCanonical<T = unknown>(value: ICanonical<T> | ICanonicalSource<T>): ICanonical<T> {
    if ((value as ICanonicalSource<T>)._peekCanonicalRepresentation) {
        return (value as ICanonicalSource<T>)._peekCanonicalRepresentation();
    }
    return value as ICanonical;
}

export function toCanonicalOrUndefined<T = unknown>(
    value: ICanonical<T> | ICanonicalSource<T> | undefined
): ICanonical<T> | undefined {
    if ((value as ICanonicalSource<T>)?._peekCanonicalRepresentation) {
        return (value as ICanonicalSource<T>)._peekCanonicalRepresentation();
    }
    return value as ICanonical<T> | undefined;
}

export function equals<A, B>(
    a: ICanonical<A> | ICanonicalSource<A> | undefined,
    b: ICanonical<B> | ICanonicalSource<B> | undefined
): boolean {
    if (a === undefined && b === undefined) {
        return true;
    }
    if (a === undefined) {
        return toCanonical(b as ICanonical<B> | ICanonicalSource<B>).equals(a);
    }
    return toCanonical(a as ICanonical<A> | ICanonicalSource<A>).equals(b);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonical<T>(v: any): v is ICanonical<T> {
    if (typeof v !== 'object') {
        return false;
    }
    return 'firstMappingEntry' in v && 'logicalTypes' in v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonicalSource<T>(v: any): v is ICanonicalSource<T> {
    if (typeof v !== 'object') {
        return false;
    }
    return v?._peekCanonicalRepresentation !== undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonicalLike<T>(v: any): v is CanonicalLike<T> {
    return isCanonical(v) || isCanonicalSource(v);
}
