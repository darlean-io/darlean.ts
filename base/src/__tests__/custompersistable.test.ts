import { CustomPersistable } from '../../lib';

describe('Custom perstable', () => {
    class TestPersistable<T> extends CustomPersistable<T> {
        constructor(
            value: T | undefined,
            private onLoad?: () => Promise<{ value: T | undefined; version?: string }>,
            private onPersist?: (value: T | undefined, version: string) => Promise<void>
        ) {
            super(value);
        }

        protected async _load(): Promise<{ value: T | undefined; version?: string }> {
            return this.onLoad?.() ?? { value: undefined, version: '' };
        }
        protected async _persist(value: T | undefined, version: string): Promise<void> {
            return this.onPersist?.(value, version);
        }
    }

    test('Initial value', async () => {
        const p = new TestPersistable<string>('Hello');
        expect(p.hasValue()).toBe(true);
        expect(p.getValue()).toBe('Hello');
        expect(p.tryGetValue()).toBe('Hello');
        expect(p.getVersion()).toBe(undefined);
        expect(p.isDirty()).toBe(true);
    });

    test('No initial value', async () => {
        const p = new TestPersistable<string>(undefined);
        expect(p.hasValue()).toBe(false);
        expect(() => p.getValue()).toThrow();
        expect(p.tryGetValue()).toBe(undefined);
        expect(p.getVersion()).toBe(undefined);
        expect(p.isDirty()).toBe(true);
    });

    test('Change value when dirty', async () => {
        const p = new TestPersistable<string>('Hello');
        p.change('Hi');
        expect(p.hasValue()).toBe(true);
        expect(p.getValue()).toBe('Hi');
        expect(p.tryGetValue()).toBe('Hi');
        expect(p.getVersion()).toBe(undefined);
        expect(p.isDirty()).toBe(true);
    });

    test('Change value when not dirty', async () => {
        const p = new TestPersistable<string>('Hello');
        p.markDirty(false);
        expect(p.hasValue()).toBe(true);
        expect(p.getValue()).toBe('Hello');
        expect(p.tryGetValue()).toBe('Hello');
        expect(p.getVersion()).toBe(undefined);
        expect(p.isDirty()).toBe(false);

        p.change('Hi');
        expect(p.hasValue()).toBe(true);
        expect(p.getValue()).toBe('Hi');
        expect(p.tryGetValue()).toBe('Hi');
        expect(p.getVersion()).toBe(undefined);
        expect(p.isDirty()).toBe(true);
    });

    test('Clear', async () => {
        const p = new TestPersistable<string>('Hello');
        p.markDirty(false);
        p.clear();
        expect(p.hasValue()).toBe(false);
        expect(() => p.getValue()).toThrow();
        expect(p.tryGetValue()).toBe(undefined);
        expect(p.isDirty()).toBe(true);
    });

    test('SetValue', async () => {
        const p = new TestPersistable<string>('Hello');
        p.markDirty(false);
        p.setValue('Hi');
        expect(p.hasValue()).toBe(true);
        expect(p.getValue()).toBe('Hi');
        expect(p.isDirty()).toBe(false);
    });

    test('Load-value-keep', async () => {
        const p = new TestPersistable<string>('Hello', async () => {
            return { value: 'Hi', version: '123' };
        });
        expect(p.getValue()).toBe('Hello');
        expect(await p.load('keep')).toBe('Hi');
        expect(p.getValue()).toBe('Hi');
        expect(p.isDirty()).toBe(false);
        expect(p.getVersion()).toBe('123');
    });

    test('Load-value-clear', async () => {
        const p = new TestPersistable<string>('Hello', async () => {
            return { value: 'Hi', version: '123' };
        });
        expect(p.getValue()).toBe('Hello');
        expect(await p.load('clear')).toBe('Hi');
        expect(p.getValue()).toBe('Hi');
        expect(p.isDirty()).toBe(false);
        expect(p.getVersion()).toBe('123');
    });

    test('Load-novalue-keep', async () => {
        const p = new TestPersistable<string>('Hello', async () => {
            return { value: undefined, version: '123' };
        });
        expect(p.getValue()).toBe('Hello');
        expect(await p.load('keep')).toBe(undefined);
        expect(p.getValue()).toBe('Hello');
        expect(p.isDirty()).toBe(false);
        expect(p.getVersion()).toBe('123');
    });

    test('Load-novalue-clear', async () => {
        const p = new TestPersistable<string>('Hello', async () => {
            return { value: undefined, version: '123' };
        });
        expect(p.getValue()).toBe('Hello');
        expect(await p.load('clear')).toBe(undefined);
        expect(p.hasValue()).toBe(false);
        expect(p.isDirty()).toBe(false);
    });

    test('Store', async () => {
        let storedValue: string | undefined = 'undef';
        let storedVersion: string | undefined = 'undef';
        const p = new TestPersistable<string>(
            'Hello',
            async () => {
                return { value: 'Hi', version: '123' };
            },
            async (value: string | undefined, version: string) => {
                storedValue = value;
                storedVersion = version;
            }
        );

        await p.persist('always');
        expect(storedValue).toBe('Hello');
        expect(p.isDirty()).toBe(false);
        expect(p.getVersion()?.length ?? 0).toBeGreaterThan(5);
        expect(storedVersion).toBe(p.getVersion());

        const version1 = storedVersion;
        storedValue = 'undef';
        storedVersion = 'undef';
        await p.persist('always');
        expect(storedValue).toBe('Hello');
        expect(p.getVersion()?.length ?? 0).toBeGreaterThan(5);
        expect(storedVersion).toBe(p.getVersion());
        expect(storedVersion > version1).toBeTruthy();
    });

    test('Store-dirty', async () => {
        let storedValue: string | undefined = 'undef';
        const p = new TestPersistable<string>(
            'Hello',
            async () => {
                return { value: 'Hi', version: '123' };
            },
            async (value: string | undefined) => {
                storedValue = value;
            }
        );

        await p.persist('dirty');
        expect(storedValue).toBe('Hello');
        expect(p.isDirty()).toBe(false);
    });

    test('Store-notdirty', async () => {
        let storedValue: string | undefined = 'undef';
        const p = new TestPersistable<string>(
            'Hello',
            async () => {
                return { value: 'Hi', version: '123' };
            },
            async (value: string | undefined) => {
                storedValue = value;
            }
        );
        p.markDirty(false);
        await p.persist('dirty');
        expect(storedValue).toBe('undef');
        expect(p.isDirty()).toBe(false);
    });

    test('Store Cleared', async () => {
        let storedValue: string | undefined = 'undef';
        let storedVersion: string | undefined = 'undef';
        const p = new TestPersistable<string>(
            'Hello',
            async () => {
                return { value: 'Hi', version: '123' };
            },
            async (value: string | undefined, version: string) => {
                storedValue = value;
                storedVersion = version;
            }
        );

        p.clear();
        await p.persist('always');

        expect(storedValue).toBe(undefined);
        expect(p.isDirty()).toBe(false);
        expect(p.getVersion()?.length ?? 0).toBeGreaterThan(5);
        expect(storedVersion).toBe(p.getVersion());
    });
});
