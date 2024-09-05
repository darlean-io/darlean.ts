import { IDeSer } from '../deser';
import { MultiDeSer } from '../multideser';
import { CanonicalJsonDeSer } from '../canonicaldeser';
import { DictCanonical, ICanonical, StringCanonical, toCanonicalOrUndefined } from '@darlean/canonical';

const desers: [string, IDeSer][] = [
    ['multi', new MultiDeSer()],
    ['cj', new CanonicalJsonDeSer()]
];

describe('Canonical Deser', () => {
    test.each(desers)('%p Struct', (_name, deser) => {
        const data = DictCanonical.from(
            {
                hello: StringCanonical.from('World', ['hello'])
            },
            ['data']
        );

        const serialized = deser.serialize(data);
        const deserialized = deser.deserialize(serialized) as ICanonical;
        expect(deserialized.logicalTypes).toEqual(['data']);
        expect(toCanonicalOrUndefined(deserialized.getMappingValue('hello'))?.stringValue).toBe('World');
        expect(toCanonicalOrUndefined(deserialized.getMappingValue('hello'))?.logicalTypes).toEqual(['hello']);
    });
});
