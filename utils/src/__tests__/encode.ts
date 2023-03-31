import { decodeKeyReadable, decodeNumber, encodeKeyReadable, encodeNumber } from '../util';

describe('EncodeNumber', () => {
    test('Zero', () => {
        const encoded = encodeNumber(0);
        expect(encoded).toBe('a');

        const decoded = decodeNumber(encoded);
        expect(decoded).toBe(0);

        expect(decodeNumber('a')).toBe(0);
        expect(decodeNumber('c00')).toBe(0);
        expect(decodeNumber('b0')).toBe(0);
    });

    test('Positive', () => {
        expect(encodeNumber(1)).toBe('b1');
        expect(encodeNumber(2)).toBe('b2');
        expect(encodeNumber(9)).toBe('b9');
        expect(encodeNumber(10)).toBe('c10');
        expect(encodeNumber(19)).toBe('c19');
        expect(encodeNumber(123)).toBe('d123');

        expect(decodeNumber('b1')).toBe(1);
        expect(decodeNumber('b2')).toBe(2);
        expect(decodeNumber('b9')).toBe(9);
        expect(decodeNumber('c10')).toBe(10);
        expect(decodeNumber('c19')).toBe(19);
        expect(decodeNumber('d123')).toBe(123);
    });

    test('Fractions', () => {
        expect(encodeNumber(0.0, 2)).toBe('a');
        expect(encodeNumber(0.05, 2)).toBe('b005');
        expect(encodeNumber(0.1, 2)).toBe('b01');
        expect(encodeNumber(0.9, 2)).toBe('b09');
        expect(encodeNumber(1.1, 2)).toBe('b11');
        expect(encodeNumber(1.2, 2)).toBe('b12');
        expect(encodeNumber(-0.05, 2)).toBe('Y995');
        expect(encodeNumber(-0.1, 2)).toBe('Y99');
        expect(encodeNumber(-0.9, 2)).toBe('Y91');
        expect(encodeNumber(-1.0, 2)).toBe('Y9');
        expect(encodeNumber(-1.1, 2)).toBe('Y89');
        expect(encodeNumber(-1.2, 2)).toBe('Y88');
    });

    test('Negative', () => {
        expect(encodeNumber(-1)).toBe('Y9');
        expect(encodeNumber(-2)).toBe('Y8');
        expect(encodeNumber(-9)).toBe('Y1');
        expect(encodeNumber(-10)).toBe('X90');
        expect(encodeNumber(-19)).toBe('X81');
        expect(encodeNumber(-25)).toBe('X75');
        expect(encodeNumber(-123)).toBe('W877');

        expect(decodeNumber('Y9')).toBe(-1);
        expect(decodeNumber('Y8')).toBe(-2);
        expect(decodeNumber('Y1')).toBe(-9);
        expect(decodeNumber('X90')).toBe(-10);
        expect(decodeNumber('X81')).toBe(-19);
        expect(decodeNumber('X75')).toBe(-25);
        expect(decodeNumber('W877')).toBe(-123);
    });

    /*test('RightToLeft', () => {
        expect(decodeNumberRtl('foob1')).toStrictEqual([1, 3]);
        expect(decodeNumberRtl('fooY8')).toStrictEqual([-1, 3]);
        expect(decodeNumberRtl('foob1abc', 4)).toStrictEqual([1, 3]);
        expect(decodeNumberRtl('fooY8abc', 4)).toStrictEqual([-1, 3]);
        expect(decodeNumberRtl('fooc10')).toStrictEqual([10, 3]);
        expect(decodeNumberRtl('fooX89')).toStrictEqual([-10, 3]);
    });*/

    test('Sorting', () => {
        const numbers: number[] = [];
        for (let nr = -150; nr < 150; nr++) {
            numbers.push(nr);
        }
        const encodeds = numbers.map((nr) => encodeNumber(nr));
        const sorteds = [...encodeds];
        sorteds.sort();
        expect(sorteds).toStrictEqual(encodeds);
        const decodeds = sorteds.map((txt) => decodeNumber(txt));
        expect(decodeds).toStrictEqual(numbers);
    });

    test('Sorting float', () => {
        const numbers: number[] = [];
        for (let nr = -1500; nr < 1500; nr++) {
            numbers.push(nr * 0.01);
        }
        const encodeds = numbers.map((nr) => encodeNumber(nr, 25));
        const sorteds = [...encodeds];
        sorteds.sort();
        expect(sorteds).toStrictEqual(encodeds);
        const decodeds = sorteds.map((txt) => decodeNumber(txt));
        expect(decodeds).toStrictEqual(numbers);
    });
});

describe('Readable Encode Key', () => {
    test('Encode', () => {
        expect(encodeKeyReadable([])).toBe('');
        expect(encodeKeyReadable([''])).toBe('');
        expect(encodeKeyReadable(['p'])).toBe('.p');
        expect(encodeKeyReadable(['', ''])).toBe('--');
        expect(encodeKeyReadable(['p', ''])).toBe('.p--');
        expect(encodeKeyReadable(['', 'p'])).toBe('--.p');
        expect(encodeKeyReadable(['p', 'q'])).toBe('.p--.q');
        expect(encodeKeyReadable(['pp', 'qq'])).toBe('.p.p--.q.q');
    });

    test('Decode', () => {
        expect(decodeKeyReadable('')).toStrictEqual([]);
        expect(decodeKeyReadable('.p')).toStrictEqual(['p']);
        expect(decodeKeyReadable('--')).toStrictEqual(['', '']);
        expect(decodeKeyReadable('.p--')).toStrictEqual(['p', '']);
        expect(decodeKeyReadable('--.q')).toStrictEqual(['', 'q']);
        expect(decodeKeyReadable('.p--.q')).toStrictEqual(['p', 'q']);
        expect(decodeKeyReadable('.p.p--.q.q')).toStrictEqual(['pp', 'qq']);
    });

    test('Sorting', () => {
        const keys = [[], ['', ''], ['', 'a'], ['', 'b'], ['a'], ['a', ''], ['a', 'a'], ['a', 'b']];
        const encoded = keys.map((key) => encodeKeyReadable(key));
        const sorted = [...encoded].sort();
        const decoded = sorted.map((key) => decodeKeyReadable(key));
        expect(decoded).toStrictEqual(keys);
    });
});
