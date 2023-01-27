import { wildcardMatch } from '../util';

describe('Wildcardmatch', () => {
    test('*', async () => {
        const mask = '*';

        {
            const parts: string[] = [];
            expect(wildcardMatch('hello', mask, parts)).toBeTruthy();
            expect(parts).toEqual(['hello']);
        }

        {
            const parts: string[] = [];
            expect(wildcardMatch('', mask, parts)).toBeTruthy();
            expect(parts).toEqual(['']);
        }
    });

    test('a*', async () => {
        const mask = 'a*';

        const cases = [
            ['', false],
            ['a', true, ['']],
            ['b', false],
            ['ab', true, ['b']],
            ['abc', true, ['bc']],
            ['ba', false]
        ];
        for (const c of cases) {
            const parts: string[] = [];
            expect(wildcardMatch(c[0] as string, mask, parts)).toBe(c[1]);
            if (c[1]) {
                expect(parts).toEqual(c[2] as string[]);
            }
        }
    });

    test('*a', async () => {
        const mask = '*a';

        const cases = [
            ['', false],
            ['a', true, ['']],
            ['b', false],
            ['ab', false],
            ['ba', true, ['b']],
            ['cba', true, ['cb']]
        ];
        for (const c of cases) {
            const parts: string[] = [];
            expect(wildcardMatch(c[0] as string, mask, parts)).toBe(c[1]);
            if (c[1]) {
                expect(parts).toEqual(c[2] as string[]);
            }
        }
    });

    test('*a*', async () => {
        const mask = '*a*';

        const cases = [
            ['', false],
            ['a', true, ['', '']],
            ['b', false],
            ['ab', true, ['', 'b']],
            ['abc', true, ['', 'bc']],
            ['ba', true, ['b', '']],
            ['cba', true, ['cb', '']],
            ['bac', true, ['b', 'c']],
            ['bbacc', true, ['bb', 'cc']],
            ['aa', true, ['', 'a']],
            ['aaa', true, ['', 'aa']]
        ];
        for (const c of cases) {
            const parts: string[] = [];
            expect(wildcardMatch(c[0] as string, mask, parts)).toBe(c[1]);
            if (c[1]) {
                expect(parts).toEqual(c[2] as string[]);
            }
        }
    });

    test('a*a', async () => {
        const mask = 'a*a';

        const cases = [
            ['', false],
            ['a', false],
            ['b', false],
            ['ab', false],
            ['aa', true, ['']],
            ['aba', true, ['b']],
            ['abba', true, ['bb']]
        ];
        for (const c of cases) {
            const parts: string[] = [];
            expect(wildcardMatch(c[0] as string, mask, parts)).toBe(c[1]);
            if (c[1]) {
                expect(parts).toEqual(c[2] as string[]);
            }
        }
    });

    test('*.*.*', async () => {
        const mask = '*.*.*';

        const cases = [
            ['a.b.c', true, ['a', 'b', 'c']],
            ['a', false],
            ['b.c', false]
        ];
        for (const c of cases) {
            const parts: string[] = [];
            expect(wildcardMatch(c[0] as string, mask, parts)).toBe(c[1]);
            if (c[1]) {
                expect(parts).toEqual(c[2] as string[]);
            }
        }
    });
});
