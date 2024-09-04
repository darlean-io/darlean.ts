import { BinaryValue, binaryvalue, boolvalue, BoolValue, FloatValue, floatvalue, intvalidation, intvalue, IntValue, MomentValue, momentvalue, stringvalidation, stringvalue, StringValue } from '../primitive-valueobject';
import { discriminative } from '../valueobject';
import { structvalue, StructValue } from '../struct-valueobject';
import { sequencevalue, SequenceValue } from '../sequence-valueobject';
import { CanonicalPlainJsonDeserializer, CanonicalPlainJsonSerializer } from '../../../canonical-json/src/canonical-plain-json';

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

describe('Complex object', () => {
    @stringvalue()
    class Name extends StringValue {
        name: discriminative;
    }
    @stringvalue()
    class FirstName extends Name {
        first_name: discriminative;
    }
    @stringvalue()
    class LastName extends StringValue {
        last_name: discriminative;
    }
    @intvalidation((v) => v >= 0, 'Must not be negative')
    @intvalue()
    class Age extends IntValue {
        age: discriminative;
    }
    @sequencevalue(() => Fact)
    class Facts extends SequenceValue<Fact> {}
    @boolvalue()
    class Fact extends BoolValue {
        fact: discriminative;
    }
    @floatvalue()
    class Meters extends FloatValue {
        meters: discriminative;
    }
    @momentvalue()
    class Birthday extends MomentValue {
        birthday: discriminative;
    }
    @binaryvalue()
    class BinaryData extends BinaryValue {
        binary_data: discriminative;
    }

    @structvalue()
    class Person extends StructValue {
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

    test('Complex structure', () => {
        const person = Person.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DeBoer'),
            age: Age.from(21),
            length: Meters.from(180.5),
            facts: Facts.from([Fact.from(true), Fact.from(false)]),
            born: Birthday.from(new Date('2000-12-31T18:30:00.000Z')),
            data: BinaryData.from(Buffer.from('BINARY'))
        });

        const cloned = Person.fromCanonical(person._peekCanonicalRepresentation());

        for (const p of [person, cloned]) {
            expect(p.firstName.value).toBe('Jantje');
            expect(p.firstName instanceof FirstName).toBe(true);
            expect(p.lastName.value).toBe('DeBoer');
            expect(p.age.value).toBe(21);
            expect(p.facts.length).toBe(2);
            expect(p.facts.get(0)?.value).toBe(true);
            expect(p.facts.get(1)?.value).toBe(false);
            expect(p.length.value).toBe(180.5);
            expect(p.born.value.toISOString()).toBe('2000-12-31T18:30:00.000Z');
            expect(p.data.value.toString()).toBe('BINARY');
        }
    });

    test('Complex structure with plain js', () => {
        const person = Person.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DeBoer'),
            age: Age.from(21),
            length: Meters.from(180.5),
            facts: Facts.from([Fact.from(true), Fact.from(false)]),
            born: Birthday.from(new Date('2000-12-31T18:30:00.000Z')),
            data: BinaryData.from(Buffer.from('BINARY'))
        });
        const serializer = new CanonicalPlainJsonSerializer();
        const deserializer = new CanonicalPlainJsonDeserializer();
        
        const json = serializer.serializeToString(person);
        const clonedCanonical = deserializer.deserializeFromString(json);
        const cloned = Person.fromCanonical(clonedCanonical, {cacheCanonical: false});
        const cloned2 = Person.fromCanonical(clonedCanonical);

        for (const p of [person, cloned, cloned2]) {
            expect(p.firstName.value).toBe('Jantje');
            expect(p.firstName._logicalTypes).toEqual(['name', 'first-name']);
            expect(p.firstName._peekCanonicalRepresentation().logicalTypes).toEqual(['name', 'first-name']);
            expect(p.firstName instanceof FirstName).toBe(true);
            expect(p.lastName.value).toBe('DeBoer');
            expect(p.age.value).toBe(21);
            expect(p.age._logicalTypes).toEqual(['age']);
            expect(p.facts.length).toBe(2);
            expect(p.facts.get(0)?.value).toBe(true);
            expect(p.facts.get(1)?.value).toBe(false);
            expect(p.facts._logicalTypes).toEqual(['facts']);
            expect(p.facts.get(0)?._peekCanonicalRepresentation().logicalTypes).toEqual(['fact']);
            expect(p.length.value).toBe(180.5);
            expect(p.born.value.toISOString()).toBe('2000-12-31T18:30:00.000Z');
            expect(p.data.value.toString()).toBe('BINARY');
            expect(p._logicalTypes).toEqual(['person']);
            expect(p._peekCanonicalRepresentation().logicalTypes).toEqual(['person']);
        }
    });

});
/*
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

