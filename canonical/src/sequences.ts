import { BaseCanonical } from './base-canonical';
import { CanonicalLogicalTypes, ICanonical, ISequenceItem } from './canonical';

export class ArrayCanonical extends BaseCanonical {
    private constructor(private value: ICanonical[], logcalTypes: CanonicalLogicalTypes = []) {
        super('sequence', logcalTypes);
    }

    public get firstSequenceItem(): ISequenceItem | undefined {
        return this.getSequenceItem(0);
    }

    public asArray(): ICanonical[] {
        return this.value;
    }

    public equals(other?: ICanonical): boolean {
        if (!super.equals(other)) { return false; }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const otherArray = other!.asArray();
        if (otherArray.length !== this.value.length) { return false; }
        for (let idx=0; idx<this.value.length; idx++) {
            if (this.value[idx] === undefined) {
                if (otherArray[idx] !== undefined) {
                    return false;
                }
            } else {
                return this.value[idx].equals(otherArray[idx]);
            }
        }
        return true;
    }

    public static from(value: ICanonical[], logcalTypes: CanonicalLogicalTypes = []) {
        return new ArrayCanonical(value, logcalTypes);
    }

    private getSequenceItem(idx: number): ISequenceItem | undefined {
        if (this.value.length <= idx) {
            return undefined;
        }
        return {
            next: () => this.getSequenceItem(idx + 1),
            value: this.value[idx]
        };
    }
}
