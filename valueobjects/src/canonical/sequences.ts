import { BaseCanonical, ICanonical, ISequenceItem } from "./base";

export class ArrayCanonical extends BaseCanonical {
    constructor(private value: ICanonical[]) { super('sequence'); }
    
    public get firstSequenceItem(): ISequenceItem | undefined {
        return this.getSequenceItem(0);
    }

    public asArray(): ICanonical[] {
        return this.value;
    }

    private getSequenceItem(idx: number): ISequenceItem | undefined {
        if (this.value.length <= idx) {
            return undefined;
        }
        return {
            next: () => this.getSequenceItem(idx + 1),
            value: this.value[idx]
        }
    }
}
