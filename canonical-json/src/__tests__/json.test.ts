import {
    ArrayCanonical,
    BinaryCanonical,
    BoolCanonical,
    CanonicalLike,
    DictCanonical,
    FloatCanonical,
    ICanonical,
    IntCanonical,
    MomentCanonical,
    StringCanonical,
    toCanonical
} from '@darlean/canonical';
import { CanonicalJsonDeserializer, CanonicalJsonSerializer } from '../canonical-json';

describe('JSON', () => {
    test('Struct', async () => {
        const struct = DictCanonical.from(
            {
                'first-name': StringCanonical.from('Jantje', ['name', 'first-name']),
                'last-name': StringCanonical.from('DeBoer', ['last-name']),
                age: IntCanonical.from(21, ['age-in-years']),
                whisdom: ArrayCanonical.from(
                    [BoolCanonical.from(true, ['fact']), BoolCanonical.from(false, ['fact'])],
                    ['facts']
                ),
                length: FloatCanonical.from(180.5, ['meters']),
                born: MomentCanonical.from(new Date('2000-12-31T18:30:00.000Z'), ['birthday']),
                data: BinaryCanonical.from(Buffer.from('BINARY'), ['binary-data'])
            },
            ['person']
        );

        const ser = new CanonicalJsonSerializer();
        const deser = new CanonicalJsonDeserializer();
        const json = ser.serialize(struct);

        const p2 = deser.deserialize(json);
        const struct2: { [key: string]: ICanonical } = {};
        let entry = p2.firstMappingEntry;
        while (entry) {
            struct2[entry.key] = toCanonical(entry.value);
            entry = entry.next();
        }
        //const struct2 = p2.asDict();
        expect(struct2['first-name'].stringValue).toBe('Jantje');
        expect(struct2['first-name'].logicalTypes).toEqual(['name', 'first-name']);

        expect(struct2['last-name'].stringValue).toBe('DeBoer');
        expect(struct2['last-name'].logicalTypes).toEqual(['last-name']);

        expect(struct2['age'].intValue).toBe(21);
        expect(struct2['age'].logicalTypes).toEqual(['age-in-years']);

        const whisdom: ICanonical[] = [];
        let elem = struct2['whisdom'].firstSequenceItem;
        while (elem) {
            whisdom.push(toCanonical(elem.value));
            elem = elem.next();
        }
        expect(struct2['whisdom'].logicalTypes).toEqual(['facts']);
        expect(whisdom[0].boolValue).toBe(true);
        expect(whisdom[0].logicalTypes).toEqual(['fact']);
        expect(whisdom[1].boolValue).toBe(false);
        expect(whisdom[1].logicalTypes).toEqual(['fact']);

        expect(struct2['length'].floatValue).toBe(180.5);
        expect(struct2['length'].logicalTypes).toEqual(['meters']);

        expect(struct2['born'].momentValue.toISOString()).toBe('2000-12-31T18:30:00.000Z');
        expect(struct2['born'].logicalTypes).toEqual(['birthday']);

        expect(struct2['data'].binaryValue.toString('utf8')).toBe('BINARY');
        expect(struct2['data'].logicalTypes).toEqual(['binary-data']);

        expect(p2.logicalTypes).toEqual(['person']);
    });
});
