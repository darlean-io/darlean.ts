import { BsonDeSer } from '../bsondeser';
import { IDeSer } from '../deser';
import { MimeDeSer } from '../mimedeser';
import { MultiDeSer } from '../multideser';
import { JBDeSer } from '../jsonbinarydeser';

const desers: [string, IDeSer][] = [
    ['mime', new MimeDeSer()],
    ['multi', new MultiDeSer()],
    ['bson', new BsonDeSer(false)],
    ['jb', new JBDeSer()]
];

describe('Deser', () => {
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
        serialized.fill(1);
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data object. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;

        expect(deserialized2.Hello).toBe('World');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3.fill(1);
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2.fill(1);
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
        serialized.fill(1);
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2).toBe(42);

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3.fill(1);
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2.fill(1);
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
        serialized.fill(1);
        expect(() => deser.deserialize(serialized)).toThrow();

        // Before corrupting serialized, we made a copy that should not contain
        // the original data value. We expect that the buffer contents is used
        // for deserialization.
        const deserialized2 = deser.deserialize(serialized2) as typeof data;
        expect(deserialized2.toString()).toBe('HELLO');

        // Cross check: when we corrupt the contents of yet another copy of the
        // original buffer, we expect an error. This proves that the actual buffer
        // contents is used for deserialization.
        serialized3.fill(1);
        expect(() => deser.deserialize(serialized3)).toThrow();

        // Once serialized2 has been deserialized once before, we expect that the
        // deserialization result is NOT stored within the buffer. Let's corrupt the
        // buffer and check that deserialization DOES NOT work.
        serialized2.fill(1);
        expect(() => deser.deserialize(serialized2)).toThrow();

        // Unlike is the case with structs, the buffer is not stored within the original
        // value (that is not possible for primitives because they are not objects).
        // So, when we modify data, we should get the modified value after ser/deser.
        data[0] = 65;
        const serialized4 = deser.serialize(data);
        const deserialized4 = deser.deserialize(serialized4) as typeof data;
        expect(deserialized4.toString()).toBe('AELLO');
    });

    test.each(desers)('%p Primitive Long and Short Buffers', (_name, deser) => {
        const data = Buffer.alloc(50000);
        data.fill(65);

        const serialized = deser.serialize(data);
        expect(deser.deserialize(serialized)).toStrictEqual(data);

        const data1 = Buffer.alloc(20);
        data1.fill(66);
        const data2 = Buffer.alloc(50000);
        data2.fill(67);
        const data3 = Buffer.alloc(20);
        data3.fill(68);
        const data4 = Buffer.alloc(0);
        const data5 = Buffer.alloc(0);
        const data6 = Buffer.alloc(50000);
        data6.fill(69);
        const datas = [data, data1, data2, data3, data4, data5, data6];
        expect(deser.deserialize(deser.serialize(datas))).toStrictEqual(datas);
    });

    const ARRAY_LEN = 2000;
    const LOOP_ITER = 1000;
    const FAST_LOOP_ITER = 10 * LOOP_ITER;

    const performanceinput = {
        Hello: Array(ARRAY_LEN).fill('World'),
        Temperatures: Array(ARRAY_LEN).fill(123),
        Floats: Array(ARRAY_LEN).fill(1.23)
    };
    test.each(desers)(`%p Performance (${LOOP_ITER}x) without buffer (${ARRAY_LEN} elements)`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceinput));
        }
    });

    const performanceinputWithBuf = {
        Hello: Array(ARRAY_LEN).fill('World'),
        Temperatures: Array(ARRAY_LEN).fill(123),
        Floats: Array(ARRAY_LEN).fill(1.23),
        Buffer: Buffer.alloc(ARRAY_LEN).fill('X')
    };
    test.each(desers)(`%p Performance (${LOOP_ITER}x) with structure with buffer (${ARRAY_LEN} elements)`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceinputWithBuf));
        }
    });

    const performanceinputBuf = {
        Buffer: Buffer.alloc(ARRAY_LEN).fill('X')
    };
    test.each(desers)(`%p Performance (${LOOP_ITER}x) with plain buffer (${ARRAY_LEN} elements)`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceinputBuf));
        }
    });

    const performanceinputWithSubObjects = {
        SubObjects: Array(ARRAY_LEN).fill({
            a: 5,
            b: 3.2,
            c: 'Foo'
        })
    };
    test.each(desers)(`%p Performance (${LOOP_ITER}x) with sub objects (${ARRAY_LEN} elements)`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceinputWithSubObjects));
        }
    });

    const performanceinputSimple = {
        Hello: 'World',
        Temperature: 123,
        Float: 1.23
    };
    test.each(desers)(`%p Performance (${FAST_LOOP_ITER}x) simple object without arrays`, (_name, deser) => {
        for (let i = 0; i < FAST_LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceinputSimple));
        }
    });

    const performanceInputSeparateValues = new Array(ARRAY_LEN).fill('abc');
    const performanceInputConcatenatedValues = performanceInputSeparateValues.join(',');
    test.each(desers)(`%p Performance (${LOOP_ITER}x) separate values`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceInputSeparateValues));
        }
    });
    test.each(desers)(`%p Performance (${LOOP_ITER}x) pre-concatenated values`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            deser.deserialize(deser.serialize(performanceInputConcatenatedValues));
        }
    });
    test.each(desers)(`%p Performance (${LOOP_ITER}x) realtime-concatenated values`, (_name, deser) => {
        for (let i = 0; i < LOOP_ITER; i++) {
            const concatenated = performanceInputSeparateValues.join(',');
            (deser.deserialize(deser.serialize(concatenated)) as string).split(',');
        }
    });

    test('Interoperability BSON-MULTI', () => {
        const bsonDeser = new BsonDeSer(false);
        const multiDeser = new MultiDeSer();
        const data = { Hello: 'World' };
        const serialized = bsonDeser.serialize(data);
        const deserialized = multiDeser.deserialize(serialized);
        expect((deserialized as typeof data).Hello).toBe('World');
    });

    test('Interoperability MIME-MULTI', () => {
        const mimeDeser = new MimeDeSer();
        const multiDeser = new MultiDeSer();
        const data = { Hello: 'World' };
        const serialized = mimeDeser.serialize(data);
        const deserialized = multiDeser.deserialize(serialized);
        expect((deserialized as typeof data).Hello).toBe('World');
    });

    test('Interoperability JB-MULTI', () => {
        const jbDeser = new JBDeSer();
        const multiDeser = new MultiDeSer();
        const data = { Hello: 'World' };
        const serialized = jbDeser.serialize(data);
        const deserialized = multiDeser.deserialize(serialized);
        expect((deserialized as typeof data).Hello).toBe('World');
    });
});
