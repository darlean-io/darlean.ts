import { IDeSer } from './deser';

/**
 * Defines a generic envelope that can have a child envelope (which can also have a
 * child envelope, and so on).
 */
export interface IEnvelope {
    child?: IEnvelope | Buffer;
}

/**
 * Extracts the child envelope from a parent envelope.
 * @param deser The (de)serializer to use for deserialization (when required)
 * @param parent The envelope from which to extract the child.
 * @returns The deserialized child container as IEnvelope instance.
 */
export function extractEnvelopeChild<Child extends IEnvelope>(deser: IDeSer, parent: IEnvelope): Child | undefined {
    if (parent.child) {
        if (Buffer.isBuffer(parent.child)) {
            return deser.deserialize(parent.child) as Child;
        } else {
            return parent.child as Child;
        }
    }
}

/**
 * Serializes a given envelope and its child envelopes (recursively).
 * @param deser The (de)serializer to use for serialization (when required)
 * @param envelope The envelope that needs to be serialized
 * @returns A buffer that contains the serialized envelope
 */
export function serializeEnvelope(deser: IDeSer, envelope: IEnvelope | Buffer): Buffer {
    if (Buffer.isBuffer(envelope)) {
        return envelope;
    }

    const childBuf = envelope.child ? serializeEnvelope(deser, envelope.child) : undefined;
    envelope.child = childBuf;

    return deser.serialize(envelope);
}
