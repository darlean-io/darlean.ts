import { ICanonical } from '../canonical/base';
import { DictCanonical, MapCanonical } from '../canonical/mappings';
import { StringCanonical } from '../canonical/primitives';
import { ArrayCanonical } from '../canonical/sequences';

describe('Canonicals', () => {
    test('Basics', () => {
        const str = new StringCanonical('Hello');
        expect(() => str.binaryValue).toThrow();
        expect(str.stringValue).toBe('Hello');
    });

    test('Sequence from array', () => {
        const value = [new StringCanonical('A'), new StringCanonical('B')];
        const seq = new ArrayCanonical(value);
        const items: string[] = [];
        let item = seq.firstSequenceItem;
        while (item) {
            items.push(item.value.stringValue);
            item = item.next();
        }
        expect(items).toStrictEqual(['A', 'B']);

        const arr = seq.asArray();
        expect(arr.length).toBe(2);
        expect(arr[0].stringValue).toBe('A');
        expect(arr[1].stringValue).toBe('B');
    });

    test('Mapping from map', () => {
        const value = new Map([
            ['a', new StringCanonical('A')],
            ['b', new StringCanonical('B')]
        ]);
        const mapping = new MapCanonical(value);
        const entries: string[] = [];
        let entry = mapping.firstMappingItem;
        while (entry) {
            entries.push(entry.key);
            entries.push(entry.value.stringValue);
            entry = entry.next();
        }
        expect(entries).toStrictEqual(['a', 'A', 'b', 'B']);

        const map = mapping.asMap();
        expect(map.size).toBe(2);
        expect((map.get('a') as ICanonical)?.stringValue).toBe('A');
        expect((map.get('b') as ICanonical)?.stringValue).toBe('B');

        const dict = mapping.asDict();
        expect(dict['a'].stringValue).toBe('A');
        expect(dict['b'].stringValue).toBe('B');
    });

    test('Mapping from dict', () => {
        const value = {
            a: new StringCanonical('A'),
            b: new StringCanonical('B')
        };
        const mapping = new DictCanonical(value);
        const entries: string[] = [];
        let entry = mapping.firstMappingItem;
        while (entry) {
            entries.push(entry.key);
            entries.push(entry.value.stringValue);
            entry = entry.next();
        }
        expect(entries).toStrictEqual(['a', 'A', 'b', 'B']);

        const map = mapping.asMap();
        expect(map.size).toBe(2);
        expect(map.get('a')?.stringValue).toBe('A');
        expect(map.get('b')?.stringValue).toBe('B');

        const dict = mapping.asDict();
        expect(dict['a'].stringValue).toBe('A');
        expect(dict['b'].stringValue).toBe('B');
    });

});
