import { FloatValue, IntValue, stringvalidation, stringvalue, StringValue } from '../primitive-valueobject';
import { structvalue, StructValue } from '../struct-valueobject';
import { discriminative } from '../valueobject';
import { ArrayCanonical } from '@darlean/canonical';
import { sequencevalidation, sequencevalue, SequenceValue } from '../sequence-valueobject';

export class TextValue extends StringValue {}
stringvalue('text')(TextValue);
stringvalidation((value) => typeof value === 'string', 'Value must be a string')(TextValue);

@stringvalue() export class NamePart extends TextValue {
    NamePart: discriminative;
}
stringvalidation(validateLength(2))(NamePart);

@stringvalue()
@stringvalidation((value) => value.toLowerCase() !== value, 'Must have at least one uppercase character')
export class FirstName extends NamePart {
    FirstName: discriminative;
}

@stringvalidation((value) => value === value.toUpperCase(), 'Must be all uppercase')
@stringvalue() export class LastName extends NamePart {
    LastName: discriminative;
}

function validateLength(minLength?: number, maxLength?: number): ((value: string) => string | void) {
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

describe('Sequence value objects', () => {
    test('Array', () => {
        @sequencevalue(Person)
        class Persons extends SequenceValue<Person> {}

        {
            const persons = Persons.from([
                Person.from({
                    firstName: FirstName.from('Jantje'),
                    lastName: LastName.from('DEBOER')
                })
            ]);
            expect(persons.length).toBe(1);
            expect(persons.get(0)).toBeInstanceOf(Person);
            expect((persons.get(0) as Person).firstName.value).toBe('Jantje');
        }
    });

    test('Array from', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        expect(
            Numbers.from([] as IntValue[])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.from([IntValue.from(4)])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([4]);
        //expect(
        //    Numbers.from([3, 4])
        //        .extractElements()
        //        .map((x) => (x as IntValue).value)
        //).toEqual([3, 4]);
    });

    test('Array from repeated sequence', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        expect(
            Numbers.fillFrom(IntValue.from(3), 0)
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.fillFrom(IntValue.from(4), 0)
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.fillFrom(IntValue.from(4), 3)
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([4, 4, 4]);
    });

    test('Array from concatenation', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        expect(
            Numbers.concatenateFrom([], [])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.concatenateFrom([], [IntValue.from(2)])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([2]);
        expect(
            Numbers.concatenateFrom([IntValue.from(1)], [IntValue.from(2)])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2]);
        expect(
            Numbers.concatenateFrom([IntValue.from(1), IntValue.from(2)], [IntValue.from(3), IntValue.from(4)], [IntValue.from(5)])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
        expect(
            Numbers.concatenateFrom(Numbers.from([IntValue.from(1), IntValue.from(2)]), Numbers.from([IntValue.from(3), IntValue.from(4)]), Numbers.from([IntValue.from(5)]))
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array validation (with explicit @sequencevalue)', () => {
        @sequencevalidation((v) => v.length === 2, 'Must have length 2')
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([IntValue.from(1)])).toThrow();
        expect(() => Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3)])).toThrow();
        expect(Numbers.from([IntValue.from(1), IntValue.from(2)])).toBeDefined();
    });

    test('Array validation - typed (with explicit @sequencevalue)', () => {
        @sequencevalidation<IntValue>((v) => v[1]?.value === 9, 'Must have 9 for element 1')
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([IntValue.from(1)])).toThrow();
        expect(() => Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3)])).toThrow();
        expect(Numbers.from([IntValue.from(1), IntValue.from(9)])).toBeDefined();
    });

    test('Array validation without explicit @sequencevalue should fail', () => {
        @sequencevalidation((v) => v.length === 2, 'Must have length 2')
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([IntValue.from(1)])).toThrow();
        expect(() => Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3)])).toThrow();
        expect(() => Numbers.from([IntValue.from(1), IntValue.from(2)])).toThrow();
    });

    test('Array mapping', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        @sequencevalue(StringValue)
        class Strings extends SequenceValue<StringValue> {}

        expect(
            Numbers.mapFrom(Strings.from([StringValue.from('1'), StringValue.from('2'), StringValue.from('3')]), (v) => {
                return IntValue.from(parseInt(v.value));
            }).map((x) => x.value)
        ).toEqual([1, 2, 3]);

        //expect(
        //    Numbers.mapFrom(['1', '2', '3'], (v) => {
        //        return IntValue.from(parseInt(v));
        //    }).map((x) => x.value)
        //).toEqual([1, 2, 3]);
    });

    test('Array sorting', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        const output = Numbers.sortFrom(input, (a: IntValue, b: IntValue) => a.value - b.value);
        expect(output.map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array filtering', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        const output = Numbers.filterFrom(input, (v: IntValue) => v.value % 2 === 0);
        expect(output.map((x) => x.value)).toEqual([2, 4]);

        expect(input.filter((v) => v.value % 2 === 0).map((x) => x.value)).toEqual([2, 4]);
    });

    test('Array find', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        expect(input.find((x) => x.value === 4)?.value).toEqual(4);
        expect(input.find((x) => x.value === -99)?.value).toEqual(undefined);
    });

    test('Array findIndex', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        expect(input.findIndex((x) => x.value === 4)).toEqual(3);
        expect(input.findIndex((x) => x.value === -99)).toEqual(-1);
    });

    test('Array includes', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        expect(input.includes(IntValue.from(2))).toBe(true);
        expect(input.includes(FloatValue.from(2))).toBe(false);
        expect(input.includes(IntValue.from(9))).toBe(false);
    });

    test('Array indexOf', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(5), IntValue.from(2), IntValue.from(4), IntValue.from(3)]);
        expect(input.indexOf(IntValue.from(2))).toBe(2);
        expect(input.indexOf(FloatValue.from(2))).toBe(-1);
        expect(input.indexOf(IntValue.from(9))).toBe(-1);
    });

    test('Array reverse', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3), IntValue.from(4), IntValue.from(5)]);
        expect(input.reverse().map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
        expect(Numbers.reverseFrom(input).map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
    });

    test('Array slice', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(0), IntValue.from(1), IntValue.from(2), IntValue.from(3), IntValue.from(4), IntValue.from(5)]);
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
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3), IntValue.from(4), IntValue.from(5)]);
        const values: number[] = [];
        for (const nr of input) {
            values.push(nr.value);
        }
        expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array reduce', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const values = Numbers.from([IntValue.from(1), IntValue.from(2), IntValue.from(3), IntValue.from(4), IntValue.from(5)]);
        expect(values.reduce((prev, curr) => IntValue.from(prev.value + curr.value)).value).toBe(15);
        expect(values.reduce((prev, curr) => prev + curr.value, 10)).toBe(25);
    });

    test('Array from empty canonical', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        const can = ArrayCanonical.from([], ['numbers']);
        expect(Numbers.fromCanonical(can).length).toBe(0);
    });

    test('Required', () => {
        @sequencevalue(() => Person) class PersonList extends SequenceValue<Person> {}
        // Tests the proper typing of required. It is quite tricky to get that right.
        expect(PersonList.required()).toBeDefined;
    })
});
