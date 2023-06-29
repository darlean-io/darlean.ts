import { MultiDeSer } from '@darlean/utils';
import { extractEnvelopeChild, IEnvelope, serializeEnvelope } from '../infra/envelope';

interface IHelloEnvelope extends IEnvelope {
    hello: string;
}

interface IFooEnvelope extends IEnvelope {
    foo: number;
}

describe('Envelope', () => {
    test('Basic', () => {
        const deser = new MultiDeSer();

        const env: IHelloEnvelope = {
            hello: 'World'
        };

        const serialized = serializeEnvelope(deser, env);
        const deserialized = deser.deserialize(serialized) as typeof env;
        expect(deserialized.hello).toBe('World');
    });

    test('With object child', () => {
        const deser = new MultiDeSer();

        const child: IFooEnvelope = {
            foo: 42
        };

        const env: IHelloEnvelope = {
            hello: 'World',
            child
        };

        const extracted = extractEnvelopeChild<IFooEnvelope>(deser, env);
        expect(extracted?.foo).toBe(42);

        const serialized = serializeEnvelope(deser, env);
        const deserialized = deser.deserialize(serialized) as typeof env;
        expect(deserialized.hello).toBe('World');
        const child2 = extractEnvelopeChild<IFooEnvelope>(deser, deserialized);
        expect(child2?.foo).toBe(42);
    });

    test('With buffer child', () => {
        const deser = new MultiDeSer();

        const child: IFooEnvelope = {
            foo: 42
        };

        const env: IHelloEnvelope = {
            hello: 'World',
            child: deser.serialize(child)
        };

        const extracted = extractEnvelopeChild<IFooEnvelope>(deser, env);
        expect(extracted?.foo).toBe(42);

        const serialized = serializeEnvelope(deser, env);
        const deserialized = deser.deserialize(serialized) as typeof env;
        expect(deserialized.hello).toBe('World');
        const child2 = extractEnvelopeChild<IFooEnvelope>(deser, deserialized);
        expect(child2?.foo).toBe(42);
    });
});
