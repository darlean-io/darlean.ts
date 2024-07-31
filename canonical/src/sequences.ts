import { BaseCanonical } from './base-canonical';
import { CanonicalLike, CanonicalLogicalTypes, ICanonical, ICanonicalSource, ISequenceItem } from './canonical';
import { equals, toCanonicalOrUndefined } from './helpers';

/**
 * Implementation of a sequence canonical by means of an array
 */
export class ArrayCanonical<T extends ICanonicalSource = ICanonicalSource> extends BaseCanonical<T> {
    private constructor(private value: CanonicalLike<T>[], logcalTypes: CanonicalLogicalTypes = []) {
        super('sequence', logcalTypes);
    }

    public get firstSequenceItem(): ISequenceItem<T> | undefined {
        return this.getSequenceItemByIdx(0);
    }

    public get size(): number {
        return this.value.length;
    }

    public equals(other?: CanonicalLike<T>): boolean {
        other = toCanonicalOrUndefined(other);
        if (!super.equals(other)) {
            return false;
        }
        
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const otherSize = other!.size;
        if (otherSize !== undefined && otherSize !== this.value.length) {
            return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let item = other!.firstSequenceItem;
        let idx = 0;
        while (item) {
            if (!equals(this.value[idx], item.value)) {
                return false;
            }

            idx++;
            item = item.next();
        }

        if (idx !== this.value.length) {
            return false;
        }

        return true;
    }

    public static from<T extends ICanonicalSource = ICanonicalSource>(value: ICanonical<T>[], logcalTypes: CanonicalLogicalTypes = []) {
        return new ArrayCanonical<T>(value, logcalTypes);
    }

    public getSequenceItem(index: number): CanonicalLike<T> | undefined {
        return this.value[index];
    }
    
    private getSequenceItemByIdx(idx: number): ISequenceItem<T> | undefined {
        if (this.value.length <= idx) {
            return undefined;
        }
        return {
            next: () => this.getSequenceItemByIdx(idx + 1),
            value: this.value[idx]
        };
    }
}
