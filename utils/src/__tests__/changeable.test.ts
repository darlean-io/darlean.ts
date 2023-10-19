import { Changeable } from '../changeable';

describe('Changeable', () => {
    test('Initial value', async () => {
        const c = Changeable.from('Hello');
        expect(c.hasValue()).toBe(true);
        expect(c.getValue()).toBe('Hello');
        expect(c.tryGetValue()).toBe('Hello');
        expect(c.isDirty()).toBe(true);
    });

    test('No initial value', async () => {
        const c = Changeable.from(undefined);
        expect(c.hasValue()).toBe(false);
        expect(() => c.getValue()).toThrow();
        expect(c.tryGetValue()).toBe(undefined);
        expect(c.isDirty()).toBe(true);
    });

    test('Change value when dirty', async () => {
        const c = Changeable.from('Hello');
        c.change('Hi');
        expect(c.hasValue()).toBe(true);
        expect(c.getValue()).toBe('Hi');
        expect(c.tryGetValue()).toBe('Hi');
        expect(c.isDirty()).toBe(true);
    });

    test('Change value when not dirty', async () => {
        const c = Changeable.from('Hello');
        c.markDirty(false);
        expect(c.hasValue()).toBe(true);
        expect(c.getValue()).toBe('Hello');
        expect(c.tryGetValue()).toBe('Hello');
        expect(c.isDirty()).toBe(false);

        c.change('Hi');
        expect(c.hasValue()).toBe(true);
        expect(c.getValue()).toBe('Hi');
        expect(c.tryGetValue()).toBe('Hi');
        expect(c.isDirty()).toBe(true);
    });

    test('Clear', async () => {
        const c = Changeable.from('Hello');
        c.markDirty(false);
        c.clear();
        expect(c.hasValue()).toBe(false);
        expect(() => c.getValue()).toThrow();
        expect(c.tryGetValue()).toBe(undefined);
        expect(c.isDirty()).toBe(true);
    });

    test('SetValue', async () => {
        const c = Changeable.from('Hello');
        c.markDirty(false);
        c.setValue('Hi');
        expect(c.hasValue()).toBe(true);
        expect(c.getValue()).toBe('Hi');
        expect(c.isDirty()).toBe(false);
    });

    test('SetClear', async () => {
        const c = Changeable.from('Hello');
        c.markDirty(false);
        c.setClear();
        expect(c.hasValue()).toBe(false);
        expect(c.isDirty()).toBe(false);
    });
});
