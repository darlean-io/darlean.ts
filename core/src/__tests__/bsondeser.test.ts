import { BsonDeSer } from '../infra/bsondeser';

describe('BsonDeser', () => {
    test('Struct', () => {
        const deser = new BsonDeSer();

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
        const deser = new BsonDeSer();

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
        const deser = new BsonDeSer();

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
});
