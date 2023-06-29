import { BsonDeSer } from '../bsondeser';
import { IDeSer } from '../deser';
import { MimeDeSer} from '../mimedeser';
import { MultiDeSer } from '../multideser';

// Originally, caching was enabled by default. But, sometimes when you receive data (like when
// loading state from persistence), it is natural behaviour of developers to modify the returned
// data structure (and then persist it later, which goes wrong because it reuses the old
// buffer instead of filling a new buffer with the modified data).
// For the moment, we have made the caching optional with default to false.
// We first define the original tests (with caching enabled), and then define a copy of the
// tests, but with caching disabled. The differences are described in the comments using
// capital words like NOT and DOES NOT.

/*
describe('BsonDeserWithCaching', () => {
    test('Struct', () => {
        const deser = new BsonDeSer(true);

        const data = {
            Hello: 'World'
        };

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser to take a shortcut and use the original data object
        // stored within serialized. So we corrupt it and check that
        // deserialization still works.
        serialized[0] = 1;
        const deserialized = deser.deserialize(serialized) as typeof data;
        expect(deserialized.Hello).toEqual('World');

        // Before corrupting serialized, we made a copy that should not contain
        // the original data object. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2.Hello).toBe('World');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is stored within the buffer. Let's corrupt the
        // buffer and check that deserialization still works.
        serialized2[0] = 1;
        const deserialized2a = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2a.Hello).toBe('World');

        // When serializing our data again, it is expected that the previous serialize
        // result (stored hidden within our data) is used. Which we nulled out later on.
        // So, we first modify the data, and then assert that the serialzed buffer is corrupted.
        data.Hello = 'Moon';
        const serialized4 = deser.serialize(data);
        expect(serialized4[0]).toBe(1);
    });

    test('Primitive', () => {
        const deser = new BsonDeSer(true);

        let data = 42;

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser to take a shortcut and use the original data value
        // stored within serialized. So we corrupt it and check that
        // deserialization still works.
        serialized[0] = 1;
        const deserialized = deser.deserialize(serialized) as typeof data;
        expect(deserialized).toEqual(42);

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2).toBe(42);

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is stored within the buffer. Let's corrupt the
        // buffer and check that deserialization still works.
        serialized2[0] = 1;
        const deserialized2a = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2a).toBe(42);

        // Unlike is the case with structs, the buffer is not stored within the original
        // value (that is not possible for primitives because they are not objects).
        // So, when we modify data, we should get the modified value after ser/deser.
        data = 84;
        const serialized4 = deser.serialize(data);
        const deserialized4 = deser.deserialize(serialized4) as typeof data;
        expect(deserialized4).toBe(84);
    });

    test('Primitive Buffer', () => {
        const deser = new BsonDeSer(true);

        const data = Buffer.from('HELLO');

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser to take a shortcut and use the original data value
        // stored within serialized. So we corrupt it and check that
        // deserialization still works.
        serialized[0] = 1;
        const deserialized = deser.deserialize(serialized) as typeof data;
        expect(deserialized.toString()).toEqual('HELLO');

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2.toString()).toBe('HELLO');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is stored within the buffer. Let's corrupt the
        // buffer and check that deserialization still works.
        serialized2[0] = 1;
        const deserialized2a = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2a.toString()).toBe('HELLO');

        // Unlike is the case with structs, the buffer is not stored within the original
        // value (that is not possible for primitives because they are not objects).
        // So, when we modify data, we should get the modified value after ser/deser.
        data[0] = 65;
        const serialized4 = deser.serialize(data);
        const deserialized4 = deser.deserialize(serialized4) as typeof data;
        expect(deserialized4.toString()).toBe('AELLO');
    });
});*/

const desers: [string, IDeSer][] = [
    ['mime', new MimeDeSer()],
    ['multi', new MultiDeSer()],
    ['bson', new BsonDeSer(false)]
];

describe('DeserWithoutCaching', () => {
    test.each(desers)('%p Struct', (_name, deser) => {
        const data = {
            Hello: 'World'
        };

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser NOT to take a shortcut and NOT use the original data object
        // stored within serialized. So we corrupt it and check that
        // deserialization DOES NOT work.
        serialized[0] = 1;
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data object. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        
        expect(deserialized2.Hello).toBe('World');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2[0] = 1;
        expect(() => deser.deserialize(serialized2)).toThrow();

        // When serializing our data again, it is expected that the previous serialize
        // result (NOT stored hidden within our data) is NOT used. Which we nulled out later on.
        // So, we first modify the data, and then assert that the serialzed buffer is corrupted.
        data.Hello = 'Moon';
        const serialized4 = deser.serialize(data);
        expect(serialized4[0]).toBeGreaterThan(1);
    });

    test.each(desers)('%p Primitive', (_name, deser) => {
        let data = 42;

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser NOT to take a shortcut and NOT use the original data value
        // stored within serialized. So we corrupt it and check that
        // deserialization DOES NOT work.
        serialized[0] = 1;
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2).toBe(42);

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2[0] = 1;
        expect(() => deser.deserialize(serialized2)).toThrow();

        // Unlike is the case with structs, the buffer is not stored within the original
        // value (that is not possible for primitives because they are not objects).
        // So, when we modify data, we should get the modified value after ser/deser.
        data = 84;
        const serialized4 = deser.serialize(data);
        const deserialized4 = deser.deserialize(serialized4) as typeof data;
        expect(deserialized4).toBe(84);

        expect(deser.deserialize(deser.serialize(123.456))).toBeCloseTo(123.456);
    });

    test.each(desers)('%p Undefined', (_name, deser) => {
        expect(deser.deserialize(deser.serialize(undefined))).toBe(undefined);
        expect((deser.deserialize(deser.serialize({ x: undefined })) as { x?: string }).x).toBe(undefined);
        expect(deser.deserialize(deser.serialize([5, undefined, 'foo']))).toStrictEqual([5, undefined, 'foo']);
    });

    test.each(desers)('%p Empty array', (_name, deser) => {
        expect(deser.deserialize(deser.serialize([]))).toStrictEqual([]);
        expect((deser.deserialize(deser.serialize({ x: [] })) as { x?: string[] }).x).toStrictEqual([]);
    });

    test.each(desers)('%p Primitive Buffer', (_name, deser) => {
        const data = Buffer.from('HELLO');

        const serialized = deser.serialize(data);
        const serialized2 = Buffer.from(serialized);
        const serialized3 = Buffer.from(serialized);

        // Expect deser NOT to take a shortcut and NOT use the original data value
        // stored within serialized. So we corrupt it and check that
        // deserialization DOES NOT work.
        serialized[0] = 1;
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2.toString()).toBe('HELLO');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3[0] = 1;
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2[0] = 1;
        expect(() => deser.deserialize(serialized2)).toThrow();

        // Unlike is the case with structs, the buffer is not stored within the original
        // value (that is not possible for primitives because they are not objects).
        // So, when we modify data, we should get the modified value after ser/deser.
        data[0] = 65;
        const serialized4 = deser.serialize(data);
        const deserialized4 = deser.deserialize(serialized4) as typeof data;
        expect(deserialized4.toString()).toBe('AELLO');
    });

    const n = 2000;
    const q = 100;
    const performanceinput = {
        Hello: Array(n).fill('World'),
        Temperatures: Array(n).fill(123),
        Floats: Array(n).fill(1.23),
    };
    test.each(desers)(`%p Performance (${q}x) without buffer (${n} elements)`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceinput));
        }
    });

    const performanceinputWithBuf = {
        Hello: Array(n).fill('World'),
        Temperatures: Array(n).fill(123),
        Floats: Array(n).fill(1.23),
        Buffer: Buffer.alloc(n).fill('X')
    };
    test.each(desers)(`%p Performance (${q}x) with buffer (${n} elements)`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceinputWithBuf));
        }
    });

    const performanceinputWithSubObjects = {
        SubObjects: Array(n).fill({
            a: 5,
            b: 3.2,
            c: 'Foo'
        })
    };
    test.each(desers)(`%p Performance (${q}x) with sub objects (${n} elements)`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceinputWithSubObjects));
        }
    });

    const performanceinputSimple = {
        Hello: 'World',
        Temperature: 123,
        Float: 1.23,
    };
    test.each(desers)(`%p Performance (${q}x) simple object without arrays`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceinputSimple));
        }
    });

    const performanceInputSeparateValues = new Array(n).fill('abc');
    const performanceInputConcatenatedValues = performanceInputSeparateValues.join(',');
    test.each(desers)(`%p Performance (${q}x) separate values`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceInputSeparateValues));
        }
    });
    test.each(desers)(`%p Performance (${q}x) pre-concatenated values`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            deser.deserialize(deser.serialize(performanceInputConcatenatedValues));
        }
    });
    test.each(desers)(`%p Performance (${q}x) realtime-concatenated values`, (_name, deser) => {
        for (let i=0; i<q; i++) {
            const concatenated = performanceInputSeparateValues.join(',');
            (deser.deserialize(deser.serialize(concatenated)) as string).split(',');

        }
    });

    test('Interoperability BSON-MIME', () => {
        const bsonDeser = new BsonDeSer(false);
        const multiDeser = new MultiDeSer();
        const data = { Hello: 'World' };
        const serialized = bsonDeser.serialize(data);
        const deserialized = multiDeser.deserialize(serialized);
        expect((deserialized as typeof data).Hello).toBe('World');
    })
});
