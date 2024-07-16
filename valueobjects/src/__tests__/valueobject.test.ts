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
    arrayvalidation,
    binaryvalue,
    boolvalue,
    floatvalue,
    intvalidation,
    intvalue,
    momentvalue,
    objectvalidation,
    objectvalue,
    stringvalidation,
    stringvalue,
    typedarrayvalidation,
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
import { MapValue } from '../../lib/map-valueobject';

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

    it('String equality', () => {
        expect(StringValue.from('A').equals(StringValue.from('A'))).toBe(true);
        expect(StringValue.from('A').equals(StringValue.from('B'))).toBe(false);
        expect(StringValue.from('A').equals(undefined)).toBe(false);
        expect(StringValue.from('').equals(undefined)).toBe(false);
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

        expect(IntValue.from(2).equals(IntValue.from(2))).toBe(true);
        expect(IntValue.from(2).equals(IntValue.from(3))).toBe(false);
        expect(IntValue.from(2).equals(undefined)).toBe(false);
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

        expect(FloatValue.from(2.5).equals(FloatValue.from(2.5))).toBe(true);
        expect(FloatValue.from(2.5).equals(FloatValue.from(2.4))).toBe(false);
        expect(FloatValue.from(2.5).equals(undefined)).toBe(false);
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

        expect(BoolValue.from(true).equals(BoolValue.from(true))).toBe(true);
        expect(BoolValue.from(true).equals(BoolValue.from(false))).toBe(false);
        expect(BoolValue.from(true).equals(undefined)).toBe(false);
    });

    test('moment', () => {
        const DATE = new Date(100000);
        expect(new MomentValue(DATE).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(12345 as unknown as Date)).toThrow();
        expect(() => new MomentValue('2024-06-18T17:00Z' as unknown as Date)).toThrow();
        expect(() => new MomentValue(undefined as unknown as Date)).toThrow();
        expect(new MomentValue(DATE).ms).toBe(DATE.valueOf());

        expect(new MomentValue(DATE)._peekCanonicalRepresentation().physicalType).toBe('moment');
        expect(new MomentValue(DATE)._peekCanonicalRepresentation().momentValue.toISOString()).toBe(DATE.toISOString());
        expect(new MomentValue(MomentCanonical.from(DATE)).value.toISOString()).toBe(DATE.toISOString());
        expect(() => new MomentValue(IntCanonical.from(1))).toThrow();

        const DATE2 = new Date(100001);
        expect(MomentValue.from(DATE).equals(MomentValue.from(DATE))).toBe(true);
        expect(MomentValue.from(DATE).equals(MomentValue.from(DATE2))).toBe(false);
        expect(MomentValue.from(DATE).equals(undefined)).toBe(false);
        expect(MomentValue.from(DATE).ms).toBe(DATE.valueOf());
        expect(MomentValue.from(DATE.valueOf()).ms).toBe(DATE.valueOf());
    });

    // TODO: Test string, binary, more structs and maps

    test('Struct', () => {
        const struct = Person.from({
            firstName: new FirstName('Jantje'),
            lastName: new LastName('DEBOER')
        });
        expect(struct.firstName.value).toBe('Jantje');
        expect(struct.lastName?.value).toBe('DEBOER');

        const struct2 = Person.fromSlots(struct._.extractSlots());
        expect(struct2.firstName.value).toBe('Jantje');
        expect(struct2.lastName?.value).toBe('DEBOER');
        expect(() => struct.firstName).toThrow();

        const struct3 = new Person(struct2._peekCanonicalRepresentation(), undefined);
        expect(struct3.firstName.value).toBe('Jantje');
        expect(struct3.lastName?.value).toBe('DEBOER');
        expect(struct3._peekCanonicalRepresentation().logicalTypes).toEqual(['person']);
    });

    test('Untyped map', () => {
        const map = MapValue.from({
            Hello: FirstName.from('Hello')
        });
        expect((map.get('Hello') as FirstName)?.value).toBe('Hello');
        expect(map.get('Nono')).toBe(undefined);

        expect(map.has('Hello')).toBe(true);
        expect(map.has('Nono')).toBe(false);
        expect(Array.from(map.keys())).toEqual(['Hello']);
        expect(Array.from(map.values()).map((x) => (x as FirstName).value)).toEqual(['Hello']);

        // TODO more map tests: typed, untyped, subclasses, add decorators
    });

    test('Object validation', () => {
        @objectvalidation((v) => v.has('a') != v.has('b'), 'Must either have a or b')
        class C extends ObjectValue {
            get a() {
                return IntValue.optional();
            }
            get b() {
                return IntValue.optional();
            }
        }

        expect(C.from({ a: IntValue.from(3) })).toBeDefined();
        expect(C.from({ b: IntValue.from(4) })).toBeDefined();
        expect(() => C.from({ a: IntValue.from(3), b: IntValue.from(4) })).toThrow();
        expect(() => C.from({})).toThrow();
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

    test('Array', () => {
        @typedarrayvalue(() => Person)
        class Persons extends ArrayValue<Person> {}

        {
            const persons = Persons.from([
                Person.from({
                    firstName: FirstName.from('Jantje'),
                    lastName: new LastName('DEBOER')
                })
            ]);
            expect(persons.length).toBe(1);
            expect(persons.get(0)).toBeInstanceOf(Person);
            expect((persons.get(0) as Person).firstName.value).toBe('Jantje');
        }
    });

    test('Array from repeated sequence', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        expect(
            Numbers.from([] as IntValue[], 3)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.from([4], 0)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.from([3, 4], 1)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([3, 4]);
        expect(
            Numbers.from([3, 4], 2)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([3, 4, 3, 4]);
        expect(
            Numbers.from([9], 3)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([9, 9, 9]);
        expect(
            Numbers.from([IntValue.from(3), IntValue.from(4)], 2)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([3, 4, 3, 4]);
        expect(
            Numbers.from(Numbers.from([3, 4]), 2)
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([3, 4, 3, 4]);
    });

    test('Array from concatenation', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        expect(
            Numbers.from([], [])
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.mapFrom([1], (x) => IntValue.from(x))
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([1]);
        expect(
            Numbers.mapFrom([1], (x) => IntValue.from(x))
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([1]);
        expect(
            Numbers.from([], [2])
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([2]);
        expect(
            Numbers.from([1], [2])
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2]);
        expect(
            Numbers.from([1, 2], [3, 4], [5])
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
        expect(
            Numbers.from(Numbers.from([1, 2]), Numbers.from([3, 4]), Numbers.from([5]))
                .extractItems()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array validation (with explicit @typedarrayvalue)', () => {
        @arrayvalidation((v) => v.length === 2, 'Must have length 2')
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(Numbers.from([1, 2])).toBeDefined();
    });

    test('Array validation - typed (with explicit @typedarrayvalue)', () => {
        @typedarrayvalidation<IntValue>((v) => v[1]?.value === 9, 'Must have 9 for element 1')
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(Numbers.from([1, 9])).toBeDefined();
    });

    test('Array validation (without explicit @typedarrayvalue)', () => {
        @arrayvalidation((v) => v.length === 2, 'Must have length 2')
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(Numbers.from([1, 2])).toBeDefined();
    });

    test('Array mapping', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        @typedarrayvalue(StringValue)
        class Strings extends ArrayValue<StringValue> {}

        expect(
            Numbers.mapFrom(Strings.from(['1', '2', '3']), (v) => {
                return IntValue.from(parseInt(v.value));
            }).map((x) => x.value)
        ).toEqual([1, 2, 3]);
    });

    test('Array sorting', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        const output = Numbers.sortFrom(input, (a, b) => a.value - b.value);
        expect(output.map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array filtering', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        const output = Numbers.filterFrom(input, (v) => v.value % 2 === 0);
        expect(output.map((x) => x.value)).toEqual([2, 4]);

        expect(input.filter((v) => v.value % 2 === 0).map((x) => x.value)).toEqual([2, 4]);
    });

    test('Array find', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.find((x) => x.value === 4)?.value).toEqual(4);
        expect(input.find((x) => x.value === -99)?.value).toEqual(undefined);
    });

    test('Array findIndex', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.findIndex((x) => x.value === 4)).toEqual(3);
        expect(input.findIndex((x) => x.value === -99)).toEqual(-1);
    });

    test('Array includes', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.includes(IntValue.from(2))).toBe(true);
        expect(input.includes(FloatValue.from(2))).toBe(false);
        expect(input.includes(IntValue.from(9))).toBe(false);
    });

    test('Array indexOf', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.indexOf(IntValue.from(2))).toBe(2);
        expect(input.indexOf(FloatValue.from(2))).toBe(-1);
        expect(input.indexOf(IntValue.from(9))).toBe(-1);
    });

    test('Array reverse', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 2, 3, 4, 5]);
        expect(input.reverse().map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
        expect(Numbers.reverseFrom(input).map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
    });

    test('Array slice', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([0, 1, 2, 3, 4, 5]);
        expect(input.slice(0, 0).map((x) => x.value)).toEqual([]);
        expect(input.slice(1, 1).map((x) => x.value)).toEqual([]);
        expect(input.slice(10, 1).map((x) => x.value)).toEqual([]);
        expect(input.slice(-2, 1).map((x) => x.value)).toEqual([]);
        expect(input.slice(0, 1).map((x) => x.value)).toEqual([0]);
        expect(input.slice(1, 2).map((x) => x.value)).toEqual([1]);
        expect(input.slice(1, 3).map((x) => x.value)).toEqual([1, 2]);
        expect(input.slice(1).map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
        expect(input.slice(1, -1).map((x) => x.value)).toEqual([1, 2, 3, 4]);
        expect(input.slice(-2).map((x) => x.value)).toEqual([4, 5]);
        expect(input.slice(-2, -1).map((x) => x.value)).toEqual([4]);
        expect(input.slice().map((x) => x.value)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(input.slice(-1, -1).map((x) => x.value)).toEqual([]);

        expect(Numbers.sliceFrom(input, 0, 0).map((x) => x.value)).toEqual([]);
        expect(Numbers.sliceFrom(input, 1, 1).map((x) => x.value)).toEqual([]);
        expect(Numbers.sliceFrom(input, 10, 1).map((x) => x.value)).toEqual([]);
        expect(Numbers.sliceFrom(input, -2, 1).map((x) => x.value)).toEqual([]);
        expect(Numbers.sliceFrom(input, 0, 1).map((x) => x.value)).toEqual([0]);
        expect(Numbers.sliceFrom(input, 1, 2).map((x) => x.value)).toEqual([1]);
        expect(Numbers.sliceFrom(input, 1, 3).map((x) => x.value)).toEqual([1, 2]);
        expect(Numbers.sliceFrom(input, 1).map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
        expect(Numbers.sliceFrom(input, 1, -1).map((x) => x.value)).toEqual([1, 2, 3, 4]);
        expect(Numbers.sliceFrom(input, -2).map((x) => x.value)).toEqual([4, 5]);
        expect(Numbers.sliceFrom(input, -2, -1).map((x) => x.value)).toEqual([4]);
        expect(Numbers.sliceFrom(input).map((x) => x.value)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(Numbers.sliceFrom(input, -1, -1).map((x) => x.value)).toEqual([]);
    });

    test('Array iteration', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const input = Numbers.from([1, 2, 3, 4, 5]);
        const values: number[] = [];
        for (const nr of input) {
            values.push(nr.value);
        }
        expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array reduce', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}
        const values = Numbers.from([1, 2, 3, 4, 5]);
        expect(values.reduce((prev, curr) => IntValue.from(prev.value + curr.value)).value).toBe(15);
        expect(values.reduce((prev, curr) => prev + curr.value, 10)).toBe(25);
    });

    test('Array from empty canonical', () => {
        @typedarrayvalue(IntValue)
        class Numbers extends ArrayValue<IntValue> {}

        const can = ArrayCanonical.from([]);
        expect(new Numbers(can, can).length).toBe(0);
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
                expect(Person.from(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => Person.from(input as any)).toThrow();
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
                expect(Person.from(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => Person.from(input as any)).toThrow();
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
            expect(Person.from(input as any)).toBeDefined();
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => Person.from(input as any)).toThrow();
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
                expect(Person.from(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => Person.from(input as any)).toThrow();
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
                expect(Person.from(input as any)).toBeDefined();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(() => Person.from(input as any)).toThrow();
            }
        }
    );

    it('Struct should reject None even for optional fields (optional fields should simply not be present)', () => {
        const input = {
            firstName: StringCanonical.from('Jantje'),
            lastName: NoneCanonical.from()
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => Person.from(input as any)).toThrow();
    });

    it('Struct should accept optional fields that are not present', () => {
        const input = {
            firstName: StringCanonical.from('Jantje')
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = Person.from(input as any);
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
});
