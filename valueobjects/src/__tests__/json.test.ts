import { IntValue, PrimitiveValidator, stringv, StringValue, primitive } from '../valueobjects/primitive-valueobject';
import { objectv, structv, StructValue } from '../valueobjects/struct-valueobject';
import { CanonicalJsonSerializer, CanonicalJsonDeserializer } from '../json/canonical-json-2';

export class TextValue extends StringValue {
    static DEF = 
    primitive<string>(TextValue, 'text')
    .withValidator((value) => typeof value === 'string', 'Value must be a string');

    constructor(value: string) {
        super(value);
    }
}

export class NamePart extends TextValue {}
stringv(NamePart, 'name-part')
.withValidator(validateLength(2));

export class FirstName extends NamePart {}
stringv(FirstName, 'first-name')
.withValidator((value) => (value.toLowerCase() !== value), 'Must have at least one uppercase character');

export class LastName extends NamePart {}
stringv(LastName, 'last-name')
.withValidator((value) => (value.toLowerCase() !== value), 'Must have at least one uppercase character');

export class Person extends StructValue {
    public get firstName() { return this._req<FirstName>('first-name');}
    public get lastName() { return this._opt<LastName>('last-name');}
}
objectv(Person, 'person')
.withRequiredField('first-name', FirstName)
.withOptionalField('last-name', LastName)

export class PersonWithAge extends Person{
    public get age() { return this._req<IntValue>('age'); }
}
const pwa = structv(PersonWithAge, 'person-with-age')
    .withRequiredField('age', IntValue);

export function validateLength(minLength?: number, maxLength?: number): PrimitiveValidator<string> {
    return (value: string) => {
        if (value.length < (minLength ?? 1)) {
            return `Must have minimum length of ${minLength ?? 1}`;
        }
        if (maxLength !== undefined) {
            if (value.length > maxLength) {
                return `Must have maximum length of ${maxLength ?? 1}`;
            }
        }
    }
}

describe('JSON', () => {
    test('Struct', () => {
        const struct = new PersonWithAge({
            ['first-name']: 'Jantje',
            ['last-name']: 'DeBoer',
            ['age']: 12,
        });
        const ser = new CanonicalJsonSerializer();
        const deser = new CanonicalJsonDeserializer();
        const json = ser.serialize(struct._peekCanonicalRepresentation());
        console.log('JSON', json);
        const p2 = deser.deserialize(json, pwa) as PersonWithAge;
        expect(p2.firstName.value).toBe('Jantje');
        expect(p2.lastName?.value).toBe('DeBoer');
        expect(p2.age.value).toBe(12);
    });
});
