import { idFromText, idToText } from '../various';

describe('ID from/to text', () => {
    test('Id From/To Text', () => {
        const id1 = ['123', '4', '', '5678'];
        const text1 = idToText(id1);
        const id1r = idFromText(text1);
        expect(id1r).toStrictEqual(id1);
    });
});
