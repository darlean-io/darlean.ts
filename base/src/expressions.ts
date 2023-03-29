export type Expr = unknown[];

export function or(...items: Expr): Expr {
    return ['or', ...items];
}

export function and(...items: Expr): Expr {
    return ['and', ...items];
}

export function pk(index: string | number): Expr {
    return ['pk', index];
}

export function sk(index: string | number): Expr {
    return ['sk', index];
}

export function literal(value: unknown): Expr {
    return ['literal', value];
}

export function array(...values: Expr) {
    return ['array', ...values];
}

export function field(path: string): Expr {
    return ['field', path];
}

export function eq(a: Expr, b: Expr): Expr {
    return ['eq', a, b];
}

export function lte(a: Expr, b: Expr): Expr {
    return ['lte', a, b];
}

export function gte(a: Expr, b: Expr): Expr {
    return ['gte', a, b];
}

export function prefix(value: Expr, prefix: Expr): Expr {
    return ['prefix', value, prefix];
}

export function contains(value: Expr, ...parts: Expr): Expr {
    return ['contains', value, ...parts];
}

export function containsni(value: Expr, ...parts: Expr): Expr {
    return ['containsni', value, ...parts];
}

export function uppercase(value: Expr): Expr {
    return ['uppercase', value];
}

export function lowercase(value: Expr): Expr {
    return ['lowercase', value];
}

export function normalize(value: Expr): Expr {
    return ['normalize', value];
}

export function traverse(expr: unknown, callback: (expr: unknown, parsed: unknown[] | undefined) => void) {
    const isExpr = Array.isArray(expr);
    callback(expr, isExpr ? expr : undefined);
    if (isExpr) {
        for (let idx = 1; idx < expr.length; idx++) {
            traverse(expr[idx], callback);
        }
    }
}
