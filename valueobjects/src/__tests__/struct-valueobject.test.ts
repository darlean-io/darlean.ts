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

    test('Derive', () => {
        const p = Person.from({
            firstName: FirstName.from('Jantje'),
            lastName: LastName.from('DEBOER')
        });

        const p0 = p.derive({});
        const p1 = p.derive({
            firstName: FirstName.from('Pietje'),
            lastName: undefined
        });

        expect(p0.firstName.value).toBe('Jantje');
        expect(p0.lastName?.value).toBe('DEBOER');
        expect(p1.firstName.value).toBe('Pietje');
        expect(p1.lastName).toBeUndefined();
    });
});
