import { BoolCanonical, FloatCanonical, IntCanonical, MomentCanonical, NoneCanonical, StringCanonical } from '../canonical/primitives';
import { BoolValue, FloatValue, IntValue, MomentValue, PrimitiveValidator, stringv, StringValue, primitive } from '../valueobjects/primitive-valueobject';
import { StructValue, objectv } from '../valueobjects/struct-valueobject';
import { optional, required, stringvalidation, req, opt } from '../valueobjects/decorators';
import { discriminator } from '../valueobjects/valueobject';

export class TextValue extends StringValue {
    static DEF = 
    primitive<string>(TextValue, 'text')
    .withValidator((value) => typeof value === 'string', 'Value must be a string');
}

export class NamePart extends TextValue { NamePart: discriminator }
stringv(NamePart, 'name-part').withValidator(validateLength(2));


export class FirstName extends NamePart { FirstName: discriminator }
stringv(FirstName).withValidator((value) => (value.toLowerCase() !== value), 'Must have at least one uppercase character');

@stringvalidation((value) => value === value.toUpperCase(), 'Must be all uppercase')
export class LastName extends NamePart { LastName: discriminator }

export class Person extends StructValue {
    Person: discriminator;
    @required(FirstName) public get firstName(){ return FirstName.required() };
    @optional(LastName)  public get lastName() { return LastName.optional() };
}
/*objectv(Person, 'person')
    .withRequiredField('first-name', FirstName.DEF)
    .withOptionalField('last-name', LastName.DEF)*/

export class PersonWithAge extends Person{
    //public get age() { return this._req<IntValue>('age'); }
    @required(IntValue) public get age() { return IntValue.required() };
}
//objectv(PersonWithAge, 'person-with-age')
//    .withRequiredField('age', IntValue);

export class NestedPerson extends Person {
    @optional(NestedPerson) public get partner() { return NestedPerson.optional() };
}

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

describe('Value objects', () => {
    test('Basics', () => {
        const firstName = new FirstName('Jantje');
        expect(firstName.value).toBe('Jantje');
        expect(() => new FirstName('X')).toThrow();
    });

    it('String should not be created from undefined', () => {
        expect(() => new StringValue(undefined as unknown as string)).toThrow();
    });


    it('String should not be created from number', () => {
        expect(() => new StringValue(42 as unknown as string)).toThrow();
    });

    test('int', () => {
        expect(new IntValue(12).value).toBe(12);
        expect(new IntValue(0).value).toBe(0);
        expect(new IntValue(-5).value).toBe(-5);
        expect(() => new IntValue(0.3)).toThrow();
        expect(() => new IntValue(undefined as unknown as number)).toThrow();
        expect(() => new IntValue(NaN)).toThrow();
        expect(() => new IntValue(Infinity)).toThrow();

        expect(new IntValue(12)._peekCanonicalRepresentation().physicalType).toBe('int');
        expect(new IntValue(12)._peekCanonicalRepresentation().intValue).toBe(12);
        expect(new IntValue(new IntCanonical(12, ['int'])).value).toBe(12);
        expect(() => new IntValue(new FloatCanonical(12, ['int']))).toThrow();
    });

    test('float', () => {
        expect(new FloatValue(12).value).toBe(12);
        expect(new FloatValue(0).value).toBe(0);
        expect(new FloatValue(-5).value).toBe(-5);
        expect(new FloatValue(0.3).value).toBeCloseTo(0.3, 5);
        expect(() => new FloatValue(undefined as unknown as number)).toThrow();
        expect(() => new FloatValue(NaN)).toThrow();
        expect(() => new FloatValue(Infinity)).toThrow();

        expect(new FloatValue(12.5)._peekCanonicalRepresentation().physicalType).toBe('float');
        expect(new FloatValue(12.5)._peekCanonicalRepresentation().floatValue).toBeCloseTo(12.5, 5);
        expect(new FloatValue(new FloatCanonical(12.5, ['float'])).value).toBeCloseTo(12.5, 5);
        expect(() => new FloatValue(new IntCanonical(12, ['int']))).toThrow();
    });

    test('boolean', () => {
        expect(new BoolValue(true).value).toBe(true);
        expect(new BoolValue(false).value).toBe(false);
        expect(() => new BoolValue('true' as unknown as boolean)).toThrow();
        expect(() => new BoolValue('false' as unknown as boolean)).toThrow();
        expect(() => new BoolValue(1 as unknown as boolean)).toThrow();
        expect(() => new BoolValue(0 as unknown as boolean)).toThrow();
        expect(() => new IntValue(undefined as unknown as number)).toThrow();

        expect(new BoolValue(true)._peekCanonicalRepresentation().physicalType).toBe('bool');
        expect(new BoolValue(true)._peekCanonicalRepresentation().boolValue).toBe(true);
        expect(new BoolValue(new BoolCanonical(true, [])).value).toBe(true);
        expect(() => new BoolValue(new IntCanonical(1))).toThrow();
    });

    test('moment', () => {
        const DATE = new Date(100000);
        expect(new MomentValue(DATE).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(12345 as unknown as Date)).toThrow();
        expect(() => new MomentValue('2024-06-18T17:00Z' as unknown as Date)).toThrow();
        expect(() => new MomentValue(undefined as unknown as Date)).toThrow();

        expect(new MomentValue(DATE)._peekCanonicalRepresentation().physicalType).toBe('moment');
        expect(new MomentValue(DATE)._peekCanonicalRepresentation().momentValue.toISOString()).toBe(DATE.toISOString());
        expect(new MomentValue(new MomentCanonical(DATE)).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(new IntCanonical(1))).toThrow();
    });

    // TODO: Test string, binary, more structs and maps

    test('Struct', () => {
        /*const struct = new Person({
            ['first-name']: 'Jantje',
            ['last-name']: 'DEBOER'
        });*/
        const struct = Person.from({
            firstName: new FirstName('Jantje'),
            lastName: new LastName('DEBOER'),
        });
        expect(struct.firstName.value).toBe('Jantje');
        expect(struct.lastName?.value).toBe('DEBOER');
        
        const struct2 = new Person(struct.extractSlots()) as Person;
        expect(struct2.firstName.value).toBe('Jantje');
        expect(struct2.lastName?.value).toBe('DEBOER');
        expect(() => struct.firstName).toThrow();

        const struct3 = new Person(struct2._peekCanonicalRepresentation());
        expect(struct3.firstName.value).toBe('Jantje');
        expect(struct3.lastName?.value).toBe('DEBOER');
    });

    test('Subclass', () => {
        const p2 = new PersonWithAge({
            ['first-name']: 'Jantje',
            ['last-name']: 'DEBOER',
            ['age']: 12,
        });
        expect(p2.firstName.value).toBe('Jantje');
        expect(p2.age.value).toBe(12);
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])('Struct should validate all members for %s using object', (value) => {
        const input = {
            'first-name': value,
            'last-name': value,
        };
        if (value === 'VALID') {
            expect(new Person(input as any)).toBeDefined();
        } else {
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])('Struct should validate all members for %s using Map', (value) => {
        const input = new Map([
            ['first-name', value],
            ['last-name', value],
        ]);
        if (value === 'VALID') {
            expect(new Person(input as any)).toBeDefined();
        } else {
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it.each([
        new StringCanonical('VALID'),
        new NoneCanonical(),
        new BoolCanonical(true),
        new BoolCanonical(false),
        new IntCanonical(42),
        new FloatCanonical(-12.3),
        new StringCanonical('no-capitals'),
    ])('Struct should validate all members for %s using embedded canonicals', (value) => {
        const input = {
            'first-name': value,
            'last-name': value,
        };
        if (value.physicalType === 'string' && value.stringValue === 'VALID') {
            expect(new Person(input as any)).toBeDefined();
        } else {
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of correct type with incorrect inner value', (value) => {
        const input = {
            'first-name': new StringCanonical(value as unknown as string),
            'last-name': new StringCanonical(value as unknown as string),
        };
        if (value === 'VALID') {
            expect(new Person(input as any)).toBeDefined();
        } else {
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it.each([undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of incorrect type with incorrect inner value', (value) => {
        const input = {
            'first-name': new IntCanonical(value as unknown as number),
            'last-name': new IntCanonical(value as unknown as number),
        };
        if (value === 'VALID') {
            expect(new Person(input as any)).toBeDefined();
        } else {
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it('Struct should reject None even for optional fields (optional fields should simply not be present)', () => {
        const input = {
            'first-name': new StringCanonical('Jantje'),
            'last-name': new NoneCanonical(),
        };
        expect(() => new Person(input)).toThrow();
    });

    it('Struct should accept optional fields that are not present', () => {
        const input = {
            'first-name': new StringCanonical('Jantje')
        };
        const p = new Person(input);
        expect(p.lastName).toBeUndefined;
    });
});
