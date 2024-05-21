import { BaseCanonical, CanonicalLogicalTypes } from "./base";

export class NoneCanonical extends BaseCanonical {
    constructor(logicalTypes: CanonicalLogicalTypes = []) { super('none', logicalTypes); }
    public get noneValue(): undefined { return undefined; }
}

export class BoolCanonical extends BaseCanonical {
    constructor(private value: boolean, logicalTypes: CanonicalLogicalTypes = []) { super('bool', logicalTypes); }
    public get boolValue(): boolean { return this.value; }
}

export class IntCanonical extends BaseCanonical {
    constructor(private value: number, logicalTypes: CanonicalLogicalTypes = []) { super('int', logicalTypes); }
    public get intValue(): number { return this.value; }
}

export class FloatCanonical extends BaseCanonical {
    constructor(private value: number, logicalTypes: CanonicalLogicalTypes = []) { super('float', logicalTypes); }
    public get floatValue(): number { return this.value; }
}

export class StringCanonical extends BaseCanonical {
    constructor(private value: string, logicalTypes: CanonicalLogicalTypes = []) { super('string', logicalTypes); }
    public get stringValue(): string { return this.value; }
}

export class MomentCanonical extends BaseCanonical {
    constructor(private value: Date, logicalTypes: CanonicalLogicalTypes = []) { super('moment', logicalTypes); }
    public get momentValue(): Date { return this.value; }
}

export class BinaryCanonical extends BaseCanonical {
    constructor(private value: Buffer, logicalTypes: CanonicalLogicalTypes = []) { super('binary', logicalTypes); }
    public get binaryValue(): Buffer { return this.value; }
}
