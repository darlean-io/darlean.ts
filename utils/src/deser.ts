export interface IDeSer {
    /** Serializes value into a Buffer. After serializing, the contents of value or the returned buffer should not
     * be modified anymore to prevent unpredictable behaviour on subsequent attempts to serialize value or to
     * deserialize the resulting buffer.
     */
    serialize(value: unknown): Buffer;

    /** Deserializes the buffer into a value. After deserializing, the contents of the buffer or the returned value
     * should not be modified anymore to prevent unpredictable behaviour on subsequent attempts to deserialize buffer
     *  or to serialize the resulting value.
     */
    deserialize(buffer: Buffer): unknown;

    deserializeTyped<T>(buffer: BufferOf<T>): T;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unused-vars
export interface BufferOf<T> extends Buffer {}