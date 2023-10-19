import { initializeFrom } from './util';

/**
 * Represents a value that can be obtained and changed and for which the dirtyness can be administered.
 */
export interface IChangeable<T> {
    /**
     * Change value and mark the changeable dirtry.
     */
    change(value: T): void;

    /**
     * Make value undefined and mark the changable dirty.
     */
    clear(): void;

    /**
     * Returns the current value, or throws an error when not defined.
     */
    getValue(): T;

    /**
     * Returns the current value, or returns undefined when the current value
     * is not defined.
     */
    tryGetValue(): T | undefined;

    /**
     * Sets the current value. The changeable is not marked dirty.
     * @param newValue The new value.
     * @see @{link change} to change the value and mark the changeable dirty.
     */
    setValue(newValue: T): void;

    /**
     * Clears the current value without marking the changeable dirty.
     */
    setClear(): void;

    /**
     * Returns whether the changeable has a value
     */
    hasValue(): boolean;

    /**
     * Returns whether the changeable is dirty. That is, when it has changes with respect to a certain
     * reference situation in the past.
     */
    isDirty(): boolean;

    /**
     * Marks the changeable as dirty or not dirty.
     * @param dirty Indicates whether the changeable should be marked dirty (true, default) or not dirty (false).
     */
    markDirty(dirty?: boolean): void;

    /**
     * Copies root fields from value into this.value when they do not exist in this.value.
     * When one or more values are copied, the changeable is automatically marked dirty.
     * @param value The object of keys and associated default values.
     */
    initializeFrom(value: T): void;
}

/**
 * Standard implementation for {@link IChangeable}.
 */
export class Changeable<T> implements IChangeable<T> {
    private _dirty = false;
    private _value?: T | undefined;

    public static from<T>(value: T | undefined, dirty = true) {
        return new Changeable<T>(value, dirty);
    }

    protected constructor(value: T | undefined, dirty: boolean) {
        this._value = value;
        this._dirty = dirty;
    }

    public initializeFrom(value: T) {
        const current = (this._value ?? {}) as { [key: string]: unknown };
        const changed = initializeFrom(current, value as { [key: string]: unknown });
        if (changed) {
            this.markDirty(true);
        }
    }

    public change(value: T): void {
        this.setValue(value);
        this.markDirty(true);
    }

    public clear(): void {
        this._value = undefined;
        this._dirty = true;
    }

    public getValue(): T {
        if (this._value === undefined) {
            throw new Error('Changeable does not have a value');
        }
        return this._value;
    }

    public tryGetValue(): T | undefined {
        return this._value;
    }

    public hasValue() {
        return this._value !== undefined;
    }

    public setValue(value: T): void {
        this._value = value;
    }

    public setClear(): void {
        this._value = undefined;
    }

    public isDirty(): boolean {
        return this._dirty;
    }

    public markDirty(dirty?: boolean) {
        this._dirty = dirty ?? true;
    }
}
