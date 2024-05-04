import { BaseCanonical } from "./base";

export class NoneCanonical extends BaseCanonical {
    constructor() { super('none'); }
    public get noneValue(): undefined { return undefined; }
}

export class BoolCanonical extends BaseCanonical {
    constructor(private value: boolean) { super('bool'); }
    public get boolValue(): boolean { return this.value; }
}

export class IntCanonical extends BaseCanonical {
    constructor(private value: number) { super('int'); }
    public get intValue(): number { return this.value; }
}

export class FloatCanonical extends BaseCanonical {
    constructor(private value: number) { super('float'); }
    public get floatValue(): number { return this.value; }
}

export class StringCanonical extends BaseCanonical {
    constructor(private value: string) { super('string'); }
    public get stringValue(): string { return this.value; }
}

export class MomentCanonical extends BaseCanonical {
    constructor(private value: Date) { super('moment'); }
    public get momentValue(): Date { return this.value; }
}

export class BinaryCanonical extends BaseCanonical {
    constructor(private value: Uint8Array) { super('binary'); }
    public get binaryValue(): Uint8Array { return this.value; }
}
