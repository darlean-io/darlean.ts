import {
    BoolValue,
    CanonicalValue,
    FloatValue,
    IntValue,
    MomentValue,
    PrimitiveValidator,
    StringDef,
    StringValue
} from '../primitive-valueobject';
import { canonicalvalidation, canonicalvalue, stringvalidation, stringvalue } from '../primitive-decorators';
import { discriminative, ValidationError } from '../valueobject';
import { BoolCanonical, FloatCanonical, IntCanonical, MomentCanonical, StringCanonical } from '@darlean/canonical';
import { getDefinitionForClass, getDefinitionForValue, getValueClass, setDefinitionForClass } from '../utils';

export class TextValue extends StringValue {}
stringvalue('text')(TextValue);
stringvalidation((value) => typeof value === 'string', 'Value must be a string')(TextValue);

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
export class LastName extends NamePart {
    LastName: discriminative;
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
    test('reflection', () => {
        class MyString extends StringValue {}
        const def = new StringDef(MyString);
        setDefinitionForClass(MyString, new StringDef(MyString));
        expect(getDefinitionForClass(MyString)).toBeDefined();
        const s = new MyString(def, undefined, 'Hello');
        expect(getDefinitionForValue(s)).toBeDefined();

        expect(getValueClass(MyString)).toBe(MyString);
        expect(getValueClass(() => MyString)).toBe(MyString);
    });

    test('Construct - Do not accept canonicals for construction', () => {
        const def = FirstName._def();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => def.construct(undefined, StringCanonical.from('Jantje', ['first-name']) as any)).toThrow(ValidationError);
    });

    test('Construct - Accept native type for construction', () => {
        const def = FirstName._def();
        expect(def.construct(undefined, 'Jantje').value).toBe('Jantje');
    });

    test('Decorator order mix up', () => {
        @stringvalidation((v) => v.length === 3, 'Length must be 3')
        @stringvalue('my-type')
        class MyString extends StringValue {}
        expect(() => MyString.from('incorrect_length')).toThrow();
        expect(MyString.from('abc').value).toBe('abc');
        expect(MyString.from('abc')._def.types).toEqual(['my-type']);

        // derived string with explicit name
        {
            @stringvalidation((v) => v.startsWith('A'), 'Must start with A')
            @stringvalue('my-sub-type')
            class MySubString extends MyString {}
            expect(() => MySubString.from('incorrect_length')).toThrow();
            expect(() => MySubString.from('abc')).toThrow();
            expect(MySubString.from('Abc').value).toBe('Abc');
            expect(MySubString.from('Abc')._def.types).toEqual(['my-type', 'my-sub-type']);
        }

        // derived string with implicit name (derived from class name)
        {
            @stringvalidation((v) => v.startsWith('A'), 'Must start with A')
            @stringvalue()
            class MySubString extends MyString {}
            expect(() => MySubString.from('incorrect_length')).toThrow();
            expect(() => MySubString.from('abc')).toThrow();
            expect(MySubString.from('Abc').value).toBe('Abc');
            expect(MySubString.from('Abc')._def.types).toEqual(['my-type', 'my-sub-string']);
        }

        // derived string with no name
        {
            @stringvalidation((v) => v.startsWith('A'), 'Must start with A')
            @stringvalue('')
            class MySubString extends MyString {}
            expect(() => MySubString.from('incorrect_length')).toThrow();
            expect(() => MySubString.from('abc')).toThrow();
            expect(MySubString.from('Abc').value).toBe('Abc');
            expect(MySubString.from('Abc')._def.types).toEqual(['my-type']);
        }
    });

    test('Basics', () => {
        const firstName = FirstName.from('Jantje');
        expect(firstName.value).toBe('Jantje');
        expect(() => FirstName.from('X')).toThrow(ValidationError);
    });

    it('String should not be created from undefined', () => {
        expect(() => StringValue.from(undefined as unknown as string)).toThrow(ValidationError);
    });

    it('String should not be created from number', () => {
        expect(() => StringValue.from(42 as unknown as string)).toThrow(ValidationError);
    });

    it('String equality', () => {
        expect(StringValue.from('A').equals(StringValue.from('A'))).toBe(true);
        expect(StringValue.from('A').equals(StringValue.from('B'))).toBe(false);
        expect(StringValue.from('A').equals(undefined)).toBe(false);
        expect(StringValue.from('').equals(undefined)).toBe(false);
    });

    test('int', () => {
        expect(IntValue.from(12).value).toBe(12);
        expect(IntValue.from(0).value).toBe(0);
        expect(IntValue.from(-5).value).toBe(-5);
        expect(() => IntValue.from(0.3)).toThrow(ValidationError);
        expect(() => IntValue.from(undefined as unknown as number)).toThrow(ValidationError);
        expect(() => IntValue.from(NaN)).toThrow(ValidationError);
        expect(() => IntValue.from(Infinity)).toThrow(ValidationError);

        expect(IntValue.from(12)._peekCanonicalRepresentation().physicalType).toBe('int');
        expect(IntValue.from(12)._peekCanonicalRepresentation().intValue).toBe(12);
        expect(IntValue.from(IntCanonical.from(12, ['int'])).value).toBe(12);
        expect(() => IntValue.from(FloatCanonical.from(12, ['int']))).toThrow(ValidationError);

        expect(IntValue.from(2).equals(IntValue.from(2))).toBe(true);
        expect(IntValue.from(2).equals(IntValue.from(3))).toBe(false);
        expect(IntValue.from(2).equals(undefined)).toBe(false);
    });

    test('float', () => {
        expect(FloatValue.from(12).value).toBe(12);
        expect(FloatValue.from(0).value).toBe(0);
        expect(FloatValue.from(-5).value).toBe(-5);
        expect(FloatValue.from(0.3).value).toBeCloseTo(0.3, 5);
        expect(() => FloatValue.from(undefined as unknown as number)).toThrow(ValidationError);
        expect(() => FloatValue.from(NaN)).toThrow(ValidationError);
        expect(() => FloatValue.from(Infinity)).toThrow(ValidationError);

        expect(FloatValue.from(12.5)._peekCanonicalRepresentation().physicalType).toBe('float');
        expect(FloatValue.from(12.5)._peekCanonicalRepresentation().floatValue).toBeCloseTo(12.5, 5);
        expect(FloatValue.from(FloatCanonical.from(12.5)).value).toBeCloseTo(12.5, 5);
        // "x" is considered a sub-type of just "" so this is ok.
        expect(FloatValue.from(FloatCanonical.from(12.5, ['x'])).value).toBeCloseTo(12.5, 5);
        expect(() => FloatValue.from(IntCanonical.from(12))).toThrow(ValidationError);
        expect(() => FloatValue.from(IntCanonical.from(12, ['x']))).toThrow(ValidationError);

        expect(FloatValue.from(2.5).equals(FloatValue.from(2.5))).toBe(true);
        expect(FloatValue.from(2.5).equals(FloatValue.from(2.4))).toBe(false);
        expect(FloatValue.from(2.5).equals(undefined)).toBe(false);
    });

    test('boolean', () => {
        expect(BoolValue.from(true).value).toBe(true);
        expect(BoolValue.from(false).value).toBe(false);
        expect(() => BoolValue.from('true' as unknown as boolean)).toThrow(ValidationError);
        expect(() => BoolValue.from('false' as unknown as boolean)).toThrow(ValidationError);
        expect(() => BoolValue.from(1 as unknown as boolean)).toThrow(ValidationError);
        expect(() => BoolValue.from(0 as unknown as boolean)).toThrow(ValidationError);
        expect(() => BoolValue.from(undefined as unknown as boolean)).toThrow(ValidationError);

        expect(BoolValue.from(true)._peekCanonicalRepresentation().physicalType).toBe('bool');
        expect(BoolValue.from(true)._peekCanonicalRepresentation().boolValue).toBe(true);
        expect(BoolValue.from(BoolCanonical.from(true, [])).value).toBe(true);
        expect(() => BoolValue.from(IntCanonical.from(1))).toThrow(ValidationError);

        expect(BoolValue.from(true).equals(BoolValue.from(true))).toBe(true);
        expect(BoolValue.from(true).equals(BoolValue.from(false))).toBe(false);
        expect(BoolValue.from(true).equals(undefined)).toBe(false);
    });

    test('moment', () => {
        const DATE = new Date(100000);
        expect(MomentValue.from(DATE).value.toISOString()).toBe(DATE.toISOString());
        expect(() => MomentValue.from(12345 as unknown as Date)).toThrow(ValidationError);
        expect(() => MomentValue.from('2024-06-18T17:00Z' as unknown as Date)).toThrow(ValidationError);
        expect(() => MomentValue.from(undefined as unknown as Date)).toThrow(ValidationError);
        expect(MomentValue.from(DATE).ms).toBe(DATE.valueOf());

        expect(MomentValue.from(DATE)._peekCanonicalRepresentation().physicalType).toBe('moment');
        expect(MomentValue.from(DATE)._peekCanonicalRepresentation().momentValue.toISOString()).toBe(DATE.toISOString());
        expect(MomentValue.from(MomentCanonical.from(DATE)).value.toISOString()).toBe(DATE.toISOString());
        expect(() => MomentValue.from(IntCanonical.from(1))).toThrow(ValidationError);

        const DATE2 = new Date(100001);
        expect(MomentValue.from(DATE).equals(MomentValue.from(DATE))).toBe(true);
        expect(MomentValue.from(DATE).equals(MomentValue.from(DATE2))).toBe(false);
        expect(MomentValue.from(DATE).equals(undefined)).toBe(false);
        expect(MomentValue.from(DATE).ms).toBe(DATE.valueOf());
        expect(MomentValue.fromMs(DATE.valueOf()).ms).toBe(DATE.valueOf());
    });

    test('canonical', () => {
        @canonicalvalidation((v) => v.physicalType === 'float' || v.physicalType === 'string', 'Must be a float or string')
        @canonicalvalue()
        class StringOrFloat extends CanonicalValue {}
        expect(StringOrFloat.from(StringCanonical.from('Hello', ['string-or-float'])).value.stringValue).toBe('Hello');
        expect(() => StringOrFloat.from(StringCanonical.from('Hello', ['hello'])).value.stringValue).toThrow(ValidationError);
        expect(() => StringOrFloat.from(IntCanonical.from(123))).toThrow(ValidationError);
    });
});
