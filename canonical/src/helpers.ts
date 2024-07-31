import { CanonicalLike, ICanonical, ICanonicalSource } from './canonical';

export function toCanonical<T extends ICanonicalSource = ICanonicalSource>(value: CanonicalLike<T>): ICanonical<T> {
    if (isCanonical(value)) {
        return value;
    }

    if ((value as T)._peekCanonicalRepresentation) {
        return (value as T)._peekCanonicalRepresentation();
    }

    throw new Error('Value is not a canonical and not a canonical source');
}

export function toCanonicalOrUndefined<T extends ICanonicalSource = ICanonicalSource>(
    value: CanonicalLike<T> | undefined
): ICanonical<T> | undefined {
    return value === undefined ? undefined : toCanonical(value);
}

export function equals<A extends ICanonicalSource = ICanonicalSource, B extends ICanonicalSource = ICanonicalSource>(
    a: CanonicalLike<A> | undefined,
    b: CanonicalLike<B> | undefined
): boolean {
    if (a === undefined && b === undefined) {
        return true;
    }
    if (a === undefined) {
        return toCanonical(b as CanonicalLike<B>).equals(a);
    }
    return toCanonical(a as CanonicalLike<A>).equals(b);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonical<T extends ICanonicalSource = ICanonicalSource>(v: any): v is ICanonical<T> {
    if (typeof v !== 'object') {
        return false;
    }
    return (v as ICanonical)?.isCanonical?.();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonicalSource(v: any): v is ICanonicalSource {
    if (typeof v !== 'object') {
        return false;
    }
    return v?._peekCanonicalRepresentation !== undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCanonicalLike<T extends ICanonicalSource = ICanonicalSource>(v: any): v is CanonicalLike<T> {
    return isCanonical(v) || isCanonicalSource(v);
}
