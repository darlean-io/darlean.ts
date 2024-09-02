import { stringvalue, StringValue } from '../primitive-valueobject';
import { mappingvalue, MappingValue } from '../mapping-valueobject';
import { ValidationError } from '../valueobject';

describe('Mapping value objects', () => {
    test('Mapping from dict', () => {
        @stringvalue()
        class LastName extends StringValue {}
        @mappingvalue(LastName)
        class LastNameMap extends MappingValue<LastName> {}

        const map = LastNameMap.from({
            jantje: LastName.from('Deboer'),
            Pietje: LastName.from('DeGroot')
        });

        expect(map.get('jantje')?.value).toBe('Deboer');
        expect(map.get('Pietje')?.value).toBe('DeGroot');
        expect(map.get('does-not-exist')?.value).toBeUndefined();
    });

    test('Mapping from map', () => {
        @stringvalue()
        class LastName extends StringValue {}
        @mappingvalue(LastName)
        class LastNameMap extends MappingValue<LastName> {}

        const input = new Map<string, LastName>();
        input.set('jantje', LastName.from('Deboer'));
        input.set('Pietje', LastName.from('DeGroot'));

        const map = LastNameMap.from(input);

        expect(map.get('jantje')?.value).toBe('Deboer');
        expect(map.get('Pietje')?.value).toBe('DeGroot');
        expect(map.get('does-not-exist')?.value).toBeUndefined();
    });

    test('Mapping from canonical', () => {
        @stringvalue()
        class LastName extends StringValue {}
        @mappingvalue(LastName)
        class LastNameMap extends MappingValue<LastName> {}

        const map = LastNameMap.from({
            jantje: LastName.from('Deboer'),
            Pietje: LastName.from('DeGroot')
        });

        const map2 = LastNameMap.fromCanonical(map._peekCanonicalRepresentation());

        expect(map2.get('jantje')?.value).toBe('Deboer');
        expect(map2.get('Pietje')?.value).toBe('DeGroot');
        expect(map2.get('does-not-exist')?.value).toBeUndefined();
    });

    test('Mapping with wrong type should throw error', () => {
        @stringvalue()
        class LastName extends StringValue {}
        @stringvalue()
        class FirstName extends StringValue {}

        @mappingvalue(LastName)
        class LastNameMap extends MappingValue<LastName> {}

        expect(() => LastNameMap.from({ jantje: FirstName.from('Jantje') })).toThrow(ValidationError);
    });
});
