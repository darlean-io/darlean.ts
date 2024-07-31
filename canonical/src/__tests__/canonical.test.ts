import { toCanonical } from '../helpers';
import { DictCanonical, MapCanonical } from '../mappings';
import { StringCanonical } from '../primitives';
import { ArrayCanonical } from '../sequences';

describe('Canonicals', () => {
    test('Basics', () => {
        const str = StringCanonical.from('Hello');
        expect(() => str.binaryValue).toThrow();
        expect(str.stringValue).toBe('Hello');

        expect(StringCanonical.from('A').equals(StringCanonical.from('A'))).toBe(true);
        expect(StringCanonical.from('A').equals(undefined)).toBe(false);
        expect(StringCanonical.from('').equals(undefined)).toBe(false);
        expect(StringCanonical.from('A').equals(StringCanonical.from('B'))).toBe(false);
    });

    test('Is', () => {
        const a = StringCanonical.from('A', ['A']);
        const a2 = StringCanonical.from('A', ['A']);
        const ab = StringCanonical.from('AB', ['A', 'B']);
        const b = StringCanonical.from('B', ['B']);
        const _ = StringCanonical.from('', []);

        expect(a.is(a)).toBe(true);
        expect(a.is(a2)).toBe(true);
        expect(a.is(ab)).toBe(false);
        expect(a.is(b)).toBe(false);
        expect(a.is(_)).toBe(true);

        expect(ab.is(a)).toBe(true);
        expect(ab.is(ab)).toBe(true);
        expect(ab.is(b)).toBe(false);
        expect(ab.is(_)).toBe(true);

        expect(_.is(a)).toBe(false);
        expect(_.is(ab)).toBe(false);
        expect(_.is(_)).toBe(true);
    })

    test('Sequence from array', () => {
        const value = [StringCanonical.from('A'), StringCanonical.from('B')];
        const seq = ArrayCanonical.from(value);
        const items: string[] = [];
        let item = seq.firstSequenceItem;
        while (item) {
            items.push(toCanonical(item.value).stringValue);
            item = item.next();
        }
        expect(items).toStrictEqual(['A', 'B']);

        expect(seq.size).toBe(2);
    });

    test('Mapping from map', () => {
        const value = new Map([
            ['a', StringCanonical.from('A')],
            ['b', StringCanonical.from('B')]
        ]);
        const mapping = MapCanonical.from(value);
        const entries: string[] = [];
        let entry = mapping.firstMappingEntry;
        while (entry) {
            entries.push(entry.key);
            entries.push(toCanonical(entry.value).stringValue);
            entry = entry.next();
        }
        expect(entries).toStrictEqual(['a', 'A', 'b', 'B']);

        expect(mapping.size).toBe(2);
    });

    test('Mapping from dict', () => {
        const value = {
            a: StringCanonical.from('A'),
            b: StringCanonical.from('B')
        };
        const mapping = DictCanonical.from(value);
        const entries: string[] = [];
        let entry = mapping.firstMappingEntry;
        while (entry) {
            entries.push(entry.key);
            entries.push(toCanonical(entry.value).stringValue);
            entry = entry.next();
        }
        expect(entries).toStrictEqual(['a', 'A', 'b', 'B']);

        expect(mapping.size).toBe(2);
    });
});
