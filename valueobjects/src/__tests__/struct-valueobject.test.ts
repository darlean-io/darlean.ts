import { BoolValue, IntValue, NoneValue, stringvalidation, stringvalue, StringValue } from '../primitive-valueobject';
import { discriminative } from '../valueobject';
import { BoolCanonical, FloatCanonical, IntCanonical, MapCanonical, NoneCanonical, StringCanonical } from '@darlean/canonical';
import { structvalidation, structvalue, StructValue } from '../struct-valueobject';

export class TextValue extends StringValue {}
stringvalue('text')(TextValue);
stringvalidation((value) => typeof value === 'string', 'Value must be a string')(TextValue);

@stringvalue()
export class NamePart extends TextValue {
    NamePart: discriminative;
}
stringvalidation(validateLength(2))(NamePart);

@stringvalue()
@stringvalidation((value) => value.toLowerCase() !== value, 'Must have at least one uppercase character')
export class FirstName extends NamePart {
    FirstName: discriminative;
}

@stringvalidation((value) => value === value.toUpperCase(), 'Must be all uppercase')
@stringvalue()
export class LastName extends NamePart {
    LastName: discriminative;
}

export function validateLength(minLength?: number, maxLength?: number): (value: string) => string | void {
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

@structvalue()
export class Person extends StructValue {
    private person: discriminative;

    public get firstName() {
        return FirstName.required();
    }
    public get lastName() {
        return LastName.optional();
    }
}

@structvalue()
export class PersonWithAge extends Person {
    public get age() {
        return IntValue.required();
    }
}

@structvalue()
export class NestedPerson extends Person {
    public get partner() {
        return NestedPerson.optional();
    }
}

describe('Struct value objects', () => {
    // TODO: Test string, binary, more structs and maps
    test('Struct', () => {
        const struct = Person.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DEBOER')
        });

        expect(struct.firstName.value).toBe('Jantje');
        expect(struct.lastName?.value).toBe('DEBOER');

        const struct2 = Person.fromSlots(struct._.extractSlots());
        expect(struct2.firstName.value).toBe('Jantje');
        expect(struct2.lastName?.value).toBe('DEBOER');
        expect(() => struct.firstName).toThrow();

        const struct3 = Person.fromCanonical(struct2._peekCanonicalRepresentation());
        expect(struct3.firstName.value).toBe('Jantje');
        expect(struct3.lastName?.value).toBe('DEBOER');
        expect(struct3._peekCanonicalRepresentation().logicalTypes).toEqual(['person']);
    });

    test('Struct validation', () => {
        @structvalidation((v) => v.has('a') != v.has('b'), 'Must either have a or b')
        @structvalue()
        class C extends StructValue {
            get a() {
                return IntValue.optional();
            }
            get b() {
                return IntValue.optional();
            }
        }

        expect(C.fromPartial({ a: IntValue.from(3) })).toBeDefined();
        expect(C.fromPartial({ b: IntValue.from(4) })).toBeDefined();
        expect(() => C.from({ a: IntValue.from(3), b: IntValue.from(4) })).toThrow();
        expect(() => C.fromPartial({})).toThrow();
    });

    test('Subclass', () => {
        const p2 = PersonWithAge.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DEBOER'),
            age: IntValue.from(12)
        });
        expect(p2.firstName.value).toBe('Jantje');
        expect(p2.age.value).toBe(12);
    });

    it.each([
        FirstName.from('VALID'),
        StringValue.from('Random string'),
        NoneValue.from(undefined),
        BoolValue.from(true),
        // Canonicals are not allowed as input to "from"; only instances of Value. Even not when all the fields
        // (like logical type) are set correctly.
        StringCanonical.from('INVALID', ['text', 'name-part', 'first-name'])
    ])('Struct should validate types of all members for %s', (value) => {
        const input = {
            firstName: value
        };
        if (value instanceof StringValue && value.value === 'VALID') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(Person.from(input as any)).toBeDefined();
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => Person.from(input as any)).toThrow();
        }
    });

    it.each([
        StringCanonical.from('VALID', ['text', 'name-part', 'first-name']),
        NoneCanonical.from(['text', 'name-part', 'first-name']),
        BoolCanonical.from(true, ['text', 'name-part', 'first-name']),
        BoolCanonical.from(false, ['text', 'name-part', 'first-name']),
        IntCanonical.from(42, ['text', 'name-part', 'first-name']),
        FloatCanonical.from(-12.3, ['text', 'name-part', 'first-name']),
        StringCanonical.from('no-capitals', ['text', 'name-part', 'first-name'])
    ])('Struct should validate types of all members for %s for canonical', (value) => {
        const map = new Map();
        map.set('first-name', value);
        const input = MapCanonical.from(map, ['person']);
        if (value instanceof StringCanonical && value.stringValue === 'VALID') {
            expect(Person.fromCanonical(input)).toBeDefined();
        } else {
            expect(() => Person.fromCanonical(input)).toThrow();
        }
    });

    it.each(['VALID', undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of correct type with incorrect inner value',
        (value) => {
            const map = new Map();
            map.set('first-name', StringCanonical.from(value as unknown as string, ['text', 'name-part', 'first-name']));
            map.set('last-name', StringCanonical.from(value as unknown as string, ['text', 'name-part', 'last-name']));
            const input = MapCanonical.from(map, ['person']);

            if (value === 'VALID') {
                expect(Person.fromCanonical(input)).toBeDefined();
            } else {
                expect(() => Person.fromCanonical(input)).toThrow();
            }
        }
    );

    it.each([undefined, 'true', 'false', 42, -12.3, 'no-capitals'])(
        'Struct should validate all members for %s using embedded canonical of incorrect type with incorrect inner value',
        (value) => {
            const map = new Map();
            map.set('first-name', IntCanonical.from(value as unknown as number, ['text', 'name-part', 'first-name']));
            map.set('last-name', IntCanonical.from(value as unknown as number, ['text', 'name-part', 'last-name']));
            const input = MapCanonical.from(map, ['person']);
            expect(() => Person.fromCanonical(input)).toThrow();
        }
    );

    it('Struct should reject None even for optional fields (optional fields should simply not be present)', () => {
        const input = {
            firstName: FirstName.from('Jantje'),
            lastName: NoneValue.from(undefined) as unknown as LastName
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => Person.from(input)).toThrow();
    });

    it('Struct should accept optional fields that are not present', () => {
        const input = {
            firstName: FirstName.from('Jantje')
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = Person.fromPartial(input as any);
        expect(p.lastName).toBeUndefined;
        expect(p.firstName).toBeInstanceOf(FirstName);
        expect(p.firstName.value).toBe('Jantje');
    });

    it('Struct should accept (but ignore) optional fields that are present as undefined', () => {
        const input = {
            firstName: FirstName.from('Jantje'),
            lastName: undefined
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = Person.from(input);
        expect(p.lastName).toBeUndefined;
        expect(p.firstName).toBeInstanceOf(FirstName);
        expect(p.firstName.value).toBe('Jantje');
    });
});

/*
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
            facts: Facts.from([true, false]),
            born: Birthday.from(new Date('2000-12-31T18:30:00.000Z')),
            data: BinaryData.from(Buffer.from('BINARY'))
        });

        const cloned = new Person(person._peekCanonicalRepresentation(), undefined);

        for (const p of [person, cloned]) {
            expect(p.firstName.value).toBe('Jantje');
            expect(p.firstName instanceof FirstName).toBe(true);
            expect(p.lastName.value).toBe('DeBoer');
            expect(p.age.value).toBe(21);
            expect(p.facts.length).toBe(2);
            expect(p.facts.get(0).value).toBe(true);
            expect(p.facts.get(1).value).toBe(false);
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
        const p = Person.fromCanonical(
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
        expect(p.friends?.get(0).firstName.value).toBe('Bob');
        expect(p.friends?.get(1).firstName.value).toBe('Charlie');
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

        const p = Person.fromCanonical(
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

        const p = Person.fromCanonical(
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

        expect(() => Person.fromCanonical(DictCanonical.from({}))).toThrow();
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
                    }),
                    undefined,
                    true
                )
        ).toThrow();

        expect(
            () =>
                new Person(
                    DictCanonical.from({
                        'first-name': StringCanonical.from('Jantje', ['first-name'])
                    }),
                    undefined,
                    true
                )
        ).not.toThrow();
    });
}); */
