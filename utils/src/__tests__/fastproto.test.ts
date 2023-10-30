import { FastProtoReader, FastProtoWriter } from '../fastproto';
import { IBufWithCursor } from '../bufferwithcursor';

interface ITestObject {
    firstName: string;
    age: number;
    happy: boolean;
    data?: Buffer;
}

const CHAR_CODE_TRUE = 't'.charCodeAt(0);
const CHAR_CODE_FALSE = 'f'.charCodeAt(0);

const TEST_OBJECT: ITestObject = {
    firstName: 'Foo',
    age: 42,
    happy: true
};

const DATA_SIZE = 512;

const TEST_OBJECT_WITH_DATA: ITestObject = {
    firstName: 'Foo',
    age: 42,
    happy: true,
    data: Buffer.alloc(DATA_SIZE)
};

function serialize(buf: IBufWithCursor, value: ITestObject) {
    FastProtoWriter.writeString(buf, value.firstName);
    FastProtoWriter.writeUnsignedInt(buf, value.age);
    FastProtoWriter.writeChar(buf, value.happy ? CHAR_CODE_TRUE : CHAR_CODE_FALSE);
    FastProtoWriter.writeBinary(buf, value.data);
}

function deserialize(buf: IBufWithCursor): ITestObject {
    return {
        firstName: FastProtoReader.readString(buf) || '',
        age: FastProtoReader.readUnsignedInt(buf),
        happy: FastProtoReader.readChar(buf) === CHAR_CODE_TRUE,
        data: FastProtoReader.readBinary(buf)
    };
}

const N = 100000;
const BUF = Buffer.alloc(50000);

describe('FastProto Functionality', () => {
    test('Basic', () => {
        const buf: IBufWithCursor = { buffer: BUF, cursor: 0 };
        serialize(buf, TEST_OBJECT_WITH_DATA);
        buf.cursor = 0;
        const result = deserialize(buf);
        expect(result).toStrictEqual(TEST_OBJECT_WITH_DATA);
    });
});

describe('FastProto Performance', () => {
    test('FastProto performance without binary data', () => {
        const buf: IBufWithCursor = { buffer: BUF, cursor: 0 };
        for (let i = 0; i < N; i++) {
            serialize(buf, TEST_OBJECT);
            buf.cursor = 0;
            deserialize(buf);
        }
    });

    test('JSON Performance without binary data', () => {
        for (let i = 0; i < N; i++) {
            const buf = JSON.stringify(TEST_OBJECT);
            JSON.parse(buf);
        }
    });

    test('FastProto performance with binary data', () => {
        const buf: IBufWithCursor = { buffer: BUF, cursor: 0 };
        for (let i = 0; i < N; i++) {
            serialize(buf, TEST_OBJECT_WITH_DATA);
            buf.cursor = 0;
            deserialize(buf);
        }
    });

    test('JSON Performance with binary data', () => {
        for (let i = 0; i < N; i++) {
            const buf = JSON.stringify(TEST_OBJECT_WITH_DATA);
            JSON.parse(buf);
        }
    });
});
