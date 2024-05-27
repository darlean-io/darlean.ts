import { IDeSer } from '../deser';
import { MultiDeSer } from '../multideser';
import { CanonicalJsonDeSer } from '../canonicaldeser';
import { DictCanonical, ICanonical, StringCanonical } from '@darlean/canonical';

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
        const struct = deserialized.asDict();
        expect(deserialized.logicalTypes).toEqual(['data']);
        expect(struct['hello'].stringValue).toBe('World');
        expect(struct['hello'].logicalTypes).toEqual(['hello']);
    });
});
