import {
    BoolValue,
    FloatValue,
    IntValue,
    MomentValue,
    PrimitiveValidator,
    stringv,
    StringValue,
    primitive,
    BinaryValue
} from '../primitive-valueobject';
import { ObjectValue } from '../struct-valueobject';
import {
    binaryvalue,
    boolvalue,
    floatvalue,
    intvalidation,
    intvalue,
    momentvalue,
    objectvalue,
    stringvalidation,
    stringvalue,
    typedarrayvalue
} from '../decorators';
import { discriminative } from '../valueobject';
import {
    ArrayCanonical,
    BoolCanonical,
    DictCanonical,
    FloatCanonical,
    IntCanonical,
    MomentCanonical,
    NoneCanonical,
    StringCanonical
} from '@darlean/canonical';
import { ArrayValue } from '../array-valueobject';

export class TextValue extends StringValue {
    static DEF = primitive<string>(TextValue, 'text').withValidator(
        (value) => typeof value === 'string',
        'Value must be a string'
    );
}

export class NamePart extends TextValue {
    NamePart: discriminative;
}
stringv(NamePart, 'name-part').withValidator(validateLength(2));

export class FirstName extends NamePart {
    FirstName: discriminative;
}
stringv(FirstName).withValidator((value) => value.toLowerCase() !== value, 'Must have at least one uppercase character');

@stringvalidation((value) => value === value.toUpperCase(), 'Must be all uppercase')
export class LastName extends NamePart {
    LastName: discriminative;
}

@objectvalue()
export class Person extends ObjectValue {
    person: discriminative;

    public get firstName() {
        return FirstName.required();
    }
    public get lastName() {
        return LastName.optional();
    }
}

@objectvalue()
export class PersonWithAge extends Person {
    public get age() {
        return IntValue.required();
    }
}

@objectvalue()
export class NestedPerson extends Person {
    public get partner() {
        return NestedPerson.optional();
    }
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
    };
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
        expect(new IntValue(IntCanonical.from(12, ['int'])).value).toBe(12);
        expect(() => new IntValue(FloatCanonical.from(12, ['int']))).toThrow();
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
        expect(new FloatValue(FloatCanonical.from(12.5, ['float'])).value).toBeCloseTo(12.5, 5);
        expect(() => new FloatValue(IntCanonical.from(12, ['int']))).toThrow();
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
        expect(new BoolValue(BoolCanonical.from(true, [])).value).toBe(true);
        expect(() => new BoolValue(IntCanonical.from(1))).toThrow();
    });

    test('moment', () => {
        const DATE = new Date(100000);
        expect(new MomentValue(DATE).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(12345 as unknown as Date)).toThrow();
        expect(() => new MomentValue('2024-06-18T17:00Z' as unknown as Date)).toThrow();
        expect(() => new MomentValue(undefined as unknown as Date)).toThrow();

        expect(new MomentValue(DATE)._peekCanonicalRepresentation().physicalType).toBe('moment');
        expect(new MomentValue(DATE)._peekCanonicalRepresentation().momentValue.toISOString()).toBe(DATE.toISOString());
        expect(new MomentValue(MomentCanonical.from(DATE)).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(IntCanonical.from(1))).toThrow();
    });

    // TODO: Test string, binary, more structs and maps

    test('Struct', () => {
        const struct = Person.from({
            firstName: new FirstName('Jantje'),
            lastName: new LastName('DEBOER')
        });
        expect(struct.firstName.value).toBe('Jantje');
        expect(struct.lastName?.value).toBe('DEBOER');

        const struct2 = Person.fromSlots(struct.extractSlots());
        expect(struct2.firstName.value).toBe('Jantje');
        expect(struct2.lastName?.value).toBe('DEBOER');
        expect(() => struct.firstName).toThrow();

        const struct3 = new Person(struct2._peekCanonicalRepresentation());
        expect(struct3.firstName.value).toBe('Jantje');
        expect(struct3.lastName?.value).toBe('DEBOER');
    });

    test('Subclass', () => {
        const p2 = new PersonWithAge({
            ['firstName']: 'Jantje',
            ['lastName']: 'DEBOER',
            ['age']: 12
        });
        expect(p2.firstName.value).toBe('Jantje');
        expect(p2.age.value).toBe(12);
    });

    test('Array', () => {
        @typedarrayvalue(() => Person)
        class Persons extends ArrayValue<Person> {}

        {
            const persons = Persons.from([
                Person.from({
                    firstName: new FirstName('Jantje'),
                    lastName: new LastName('DEBOER')
                })
            ]);
            expect(persons.length).toBe(1);
            expect(persons.get(0)).toBeInstanceOf(Person);
            expect((persons.get(0) as Person).firstName.value).toBe('Jantje');
        }

        {
            const persons = Persons.from([
                {
                    firstName: new FirstName('Jantje'),
                    lastName: new LastName('DEBOER')
                }
            ]);
            expect(persons.length).toBe(1);
            expect(persons.get(0)).toBeInstanceOf(Person);
            expect((persons.get(0) as Person).firstName.value).toBe('Jantje');
        }
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using object',
        (value) => {
            const input = {
                firstName: value,
                lastName: value
            };
            if (value === 'VALID') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(new Person(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => new Person(input as any)).toThrow();
            }
        }
    );

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using Map',
        (value) => {
            const input = new Map([
                ['firstName', value],
                ['lastName', value]
            ]);
            if (value === 'VALID') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(new Person(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => new Person(input as any)).toThrow();
            }
        }
    );

    it.each([
        StringCanonical.from('VALID'),
        NoneCanonical.from(),
        BoolCanonical.from(true),
        BoolCanonical.from(false),
        IntCanonical.from(42),
        FloatCanonical.from(-12.3),
        StringCanonical.from('no-capitals')
    ])('Struct should validate all members for %s using embedded canonicals', (value) => {
        const input = {
            firstName: value,
            lastName: value
        };
        if (value.physicalType === 'string' && value.stringValue === 'VALID') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(new Person(input as any)).toBeDefined();
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => new Person(input as any)).toThrow();
        }
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of correct type with incorrect inner value',
        (value) => {
            const input = {
                firstName: StringCanonical.from(value as unknown as string),
                lastName: StringCanonical.from(value as unknown as string)
            };
            if (value === 'VALID') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(new Person(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => new Person(input as any)).toThrow();
            }
        }
    );

    it.each([undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of incorrect type with incorrect inner value',
        (value) => {
            const input = {
                firstName: IntCanonical.from(value as unknown as number),
                lastName: IntCanonical.from(value as unknown as number)
            };
            if (value === 'VALID') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(new Person(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => new Person(input as any)).toThrow();
            }
        }
    );

    it('Struct should reject None even for optional fields (optional fields should simply not be present)', () => {
        const input = {
            firstName: StringCanonical.from('Jantje'),
            lastName: NoneCanonical.from()
        };
        expect(() => new Person(input)).toThrow();
    });

    it('Struct should accept optional fields that are not present', () => {
        const input = {
            firstName: StringCanonical.from('Jantje')
        };
        const p = new Person(input);
        expect(p.lastName).toBeUndefined;
    });
});

describe('Complex object', () => {
    test('Complex structure', () => {
        @stringvalue
        class Name extends StringValue {
            name: discriminative;
        }
        @stringvalue
        class FirstName extends Name {
            first_name: discriminative;
        }
        @stringvalue
        class LastName extends StringValue {
            last_name: discriminative;
        }
        @intvalidation((v) => v >= 0, 'Must not be negative')
        @intvalue
        class Age extends IntValue {
            age: discriminative;
        }
        @typedarrayvalue(() => Fact)
        class Facts extends ArrayValue<Fact> {}
        @boolvalue
        class Fact extends BoolValue {
            fact: discriminative;
        }
        @floatvalue
        class Meters extends FloatValue {
            meters: discriminative;
        }
        @momentvalue
        class Birthday extends MomentValue {
            birthday: discriminative;
        }
        @binaryvalue
        class BinaryData extends BinaryValue {
            binary_data: discriminative;
        }

        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
            get lastName() {
                return LastName.required();
            }
            get age() {
                return Age.required();
            }
            get facts() {
                return Facts.required();
            }
            get length() {
                return Meters.required();
            }
            get born() {
                return Birthday.required();
            }
            get data() {
                return BinaryData.required();
            }
        }

        const person = Person.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DeBoer'),
            age: Age.from(21),
            length: Meters.from(180.5),
            facts: Facts.from([true, Fact.from(false)]),
            born: Birthday.from(new Date('2000-12-31T18:30:00.000Z')),
            data: BinaryData.from(Buffer.from('BINARY'))
        });

        const cloned = new Person(person._peekCanonicalRepresentation());

        for (const p of [person, cloned]) {
            expect(p.firstName.value).toBe('Jantje');
            expect(p.firstName instanceof FirstName).toBe(true);
            expect(p.lastName.value).toBe('DeBoer');
            expect(p.age.value).toBe(21);
            expect(p.facts.length).toBe(2);
            expect(p.facts.getTyped(0).value).toBe(true);
            expect(p.facts.getTyped(1).value).toBe(false);
            expect(p.length.value).toBe(180.5);
            expect(p.born.value.toISOString()).toBe('2000-12-31T18:30:00.000Z');
            expect(p.data.value.toString()).toBe('BINARY');
        }
    });
});

describe('ObjectValue Decorator', () => {
    it('Must return all fields', () => {
        @typedarrayvalue(() => Person)
        class Persons extends ArrayValue<Person> {}

        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
            get lastName() {
                return LastName.optional();
            }
            get partner() {
                return Person.optional();
            }
            get friends() {
                return Persons.optional();
            }
        }

        const partner = Person.from({
            firstName: FirstName.from('Alice')
        });
        const p = new Person(
            DictCanonical.from({
                'first-name': StringCanonical.from('Jantje', ['first-name']),
                'last-name': StringCanonical.from('DEBOER', ['last-name']),
                partner: partner._peekCanonicalRepresentation(),
                friends: ArrayCanonical.from([
                    Person.from({ firstName: FirstName.from('Bob') })._peekCanonicalRepresentation(),
                    Person.from({ firstName: FirstName.from('Charlie') })._peekCanonicalRepresentation()
                ])
            })
        );

        expect(p.firstName.value).toBe('Jantje');
        expect(p.firstName).toBeInstanceOf(FirstName);
        expect(p.lastName?.value).toBe('DEBOER');
        expect(p.partner?.firstName.value).toBe('Alice');
        expect(p.friends?.getTyped(0).firstName.value).toBe('Bob');
        expect(p.friends?.getTyped(1).firstName.value).toBe('Charlie');
    });

    it('Must support derived fields', () => {
        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
            get lastName() {
                return LastName.optional();
            }
            get fullName() {
                return this.firstName.value + ' ' + this.lastName?.value;
            }
        }

        const p = new Person(
            DictCanonical.from({
                'first-name': StringCanonical.from('Jantje', ['first-name']),
                'last-name': StringCanonical.from('DEBOER', ['last-name'])
            })
        );

        expect(p.firstName.value).toBe('Jantje');
        expect(p.firstName).toBeInstanceOf(FirstName);
        expect(p.lastName?.value).toBe('DEBOER');
        expect(p.fullName).toBe('Jantje DEBOER');
    });

    it('Must allow missing optional fields', () => {
        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
            get lastName() {
                return LastName.optional();
            }
        }

        const p = new Person(
            DictCanonical.from({
                'first-name': StringCanonical.from('Jantje', ['first-name'])
            })
        );

        expect(p.firstName.value).toBe('Jantje');
        expect(p.firstName).toBeInstanceOf(FirstName);
        expect(p.lastName).toBeUndefined();
    });

    it('Must not allow missing required fields', () => {
        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
        }

        expect(() => new Person(DictCanonical.from({}))).toThrow();
    });

    it('Must not allow fields of incorrect type', () => {
        @objectvalue()
        class Person extends ObjectValue {
            get firstName() {
                return FirstName.required();
            }
        }

        expect(
            () =>
                new Person(
                    DictCanonical.from({
                        'first-name': StringCanonical.from('Jantje', ['not-a-first-name'])
                    })
                )
        ).toThrow();
    });
});
