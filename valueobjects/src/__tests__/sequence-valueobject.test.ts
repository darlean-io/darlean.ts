import { FloatValue, IntValue, StringValue } from '../primitive-valueobject';
import { StructValue } from '../struct-valueobject';
import { discriminative } from '../valueobject';
import { ArrayCanonical } from '@darlean/canonical';
import { SequenceValue } from '../sequence-valueobject';
import { stringvalidation, stringvalue } from '../primitive-decorators';
import { sequencevalidation, sequencevalue } from '../sequence-decorators';
import { structvalue } from '../struct-decorators';

class TextValue extends StringValue {}
stringvalue('text')(TextValue);
stringvalidation((value) => typeof value === 'string', 'Value must be a string')(TextValue);

class NamePart extends TextValue {
    NamePart: discriminative;
}

@stringvalue()
@stringvalidation((value) => value.toLowerCase() !== value, 'Must have at least one uppercase character')
class FirstName extends NamePart {
    FirstName: discriminative;
}

@stringvalidation((value) => value === value.toUpperCase(), 'Must be all uppercase')
class LastName extends NamePart {
    LastName: discriminative;
}

@structvalue()
class Person extends StructValue {
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
        expect(
            Numbers.from([3, 4])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([3, 4]);
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
            Numbers.fillFrom(4, 0)
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([]);
        expect(
            Numbers.fillFrom(4, 3)
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
            Numbers.concatenateFrom([], [2])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([2]);
        expect(
            Numbers.concatenateFrom([1], [2])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2]);
        expect(
            Numbers.concatenateFrom([1, 2], [3, 4], [5])
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
        expect(
            Numbers.concatenateFrom(Numbers.from([1, 2]), Numbers.from([3, 4]), Numbers.from([5]))
                .extractElements()
                .map((x) => (x as IntValue).value)
        ).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array validation (with explicit @sequencevalue)', () => {
        @sequencevalidation((v) => v.length === 2, 'Must have length 2')
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(Numbers.from([1, 2])).toBeDefined();
    });

    test('Array validation - typed (with explicit @sequencevalue)', () => {
        @sequencevalidation<IntValue>((v) => v[1]?.value === 9, 'Must have 9 for element 1')
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(Numbers.from([1, 9])).toBeDefined();
    });

    test('Array validation without explicit @sequencevalue should fail', () => {
        @sequencevalidation((v) => v.length === 2, 'Must have length 2')
        class Numbers extends SequenceValue<IntValue> {}

        expect(() => Numbers.from([])).toThrow();
        expect(() => Numbers.from([1])).toThrow();
        expect(() => Numbers.from([1, 2, 3])).toThrow();
        expect(() => Numbers.from([1, 2])).toThrow();
    });

    test('Array mapping', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        @sequencevalue(StringValue)
        class Strings extends SequenceValue<StringValue> {}

        expect(
            Numbers.mapFrom(Strings.from(['1', '2', '3']), (v) => {
                return IntValue.from(parseInt(v.value));
            }).map((x) => x.value)
        ).toEqual([1, 2, 3]);

        expect(
            Numbers.mapFrom(['1', '2', '3'], (v) => {
                return IntValue.from(parseInt(v));
            }).map((x) => x.value)
        ).toEqual([1, 2, 3]);
    });

    test('Array sorting', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        const output = Numbers.sortFrom(input, (a: IntValue, b: IntValue) => a.value - b.value);
        expect(output.map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array filtering', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        const output = Numbers.filterFrom(input, (v: IntValue) => v.value % 2 === 0);
        expect(output.map((x) => x.value)).toEqual([2, 4]);

        expect(input.filter((v) => v.value % 2 === 0).map((x) => x.value)).toEqual([2, 4]);
    });

    test('Array find', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.find((x) => x.value === 4)?.value).toEqual(4);
        expect(input.find((x) => x.value === -99)?.value).toEqual(undefined);
    });

    test('Array findIndex', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.findIndex((x) => x.value === 4)).toEqual(3);
        expect(input.findIndex((x) => x.value === -99)).toEqual(-1);
    });

    test('Array includes', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.includes(IntValue.from(2))).toBe(true);
        expect(input.includes(FloatValue.from(2))).toBe(false);
        expect(input.includes(IntValue.from(9))).toBe(false);
    });

    test('Array indexOf', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 5, 2, 4, 3]);
        expect(input.indexOf(IntValue.from(2))).toBe(2);
        expect(input.indexOf(FloatValue.from(2))).toBe(-1);
        expect(input.indexOf(IntValue.from(9))).toBe(-1);
    });

    test('Array reverse', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 2, 3, 4, 5]);
        expect(input.reverse().map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
        expect(Numbers.reverseFrom(input).map((x) => x.value)).toEqual([5, 4, 3, 2, 1]);
    });

    test('Array slice', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
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
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const input = Numbers.from([1, 2, 3, 4, 5]);
        const values: number[] = [];
        for (const nr of input) {
            values.push(nr.value);
        }
        expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    test('Array reduce', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}
        const values = Numbers.from([1, 2, 3, 4, 5]);
        expect(values.reduce((prev, curr) => IntValue.from(prev.value + curr.value)).value).toBe(15);
        expect(values.reduce((prev, curr) => prev + curr.value, 10)).toBe(25);
    });

    test('Array from empty canonical', () => {
        @sequencevalue(IntValue)
        class Numbers extends SequenceValue<IntValue> {}

        const can = ArrayCanonical.from([], ['numbers']);
        expect(Numbers.from(can).length).toBe(0);
    });
});
