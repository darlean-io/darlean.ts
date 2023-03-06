import { filterStructure } from '../util';

describe('FilterStructure', () => {
    test('Flat', () => {
        const structure = {
            Hello: 'World'
        };
        expect(filterStructure('+Hello, -*', structure, '')).toStrictEqual({ Hello: 'World' });
        expect(filterStructure('+Hello123, -*', structure, '')).toStrictEqual({});
        expect(filterStructure('+He*, -*', structure, '')).toStrictEqual({ Hello: 'World' });
        expect(filterStructure('-He*, +*', structure, '')).toStrictEqual({});
        expect(filterStructure('+Bla*, +*', structure, '')).toStrictEqual({ Hello: 'World' });
    });

    test('Deep', () => {
        const structure = {
            Hello: 'World',
            Moon: {
                State: 'full'
            }
        };
        expect(filterStructure('+Hello, -*', structure, '')).toStrictEqual({ Hello: 'World' });
        expect(filterStructure('+Moon, -*', structure, '')).toStrictEqual({});
        expect(filterStructure('+Moon.*, -*', structure, '')).toStrictEqual({ Moon: { State: 'full' } });
        expect(filterStructure('+Hello123, -*', structure, '')).toStrictEqual({});
        expect(filterStructure('+He*, -*', structure, '')).toStrictEqual({ Hello: 'World' });
        expect(filterStructure('+Mo*, -*', structure, '')).toStrictEqual({ Moon: { State: 'full' } });
        expect(filterStructure('+Mo*, +He*, -*', structure, '')).toStrictEqual({ Hello: 'World', Moon: { State: 'full' } });
        expect(filterStructure('-He*, +*', structure, '')).toStrictEqual({ Moon: { State: 'full' } });
        expect(filterStructure('+Bla*, +*', structure, '')).toStrictEqual({ Hello: 'World', Moon: { State: 'full' } });
    });
});
