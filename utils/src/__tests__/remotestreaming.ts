import { Readable, Writable } from 'node:stream';
import { IChunk, IReadableRemoteStream, IWritableRemoteStream, ReadableRemoteStreamProducer, SequentialReadableRemoteStreamConsumer, SequentialWritableRemoteStreamProducer, WritableRemoteStreamConsumer } from '../remotestreaming';
import { sleep } from '..';

class TestProducerSource implements IReadableRemoteStream {
    private nextChunkIdx: number;

    constructor(private chunks: string[]) {
        this.nextChunkIdx = 0;
    }

    public async readChunk(): Promise<IChunk> {
        const idx = this.nextChunkIdx;
        const chunk = this.chunks[this.nextChunkIdx];
        if (chunk === 'ERROR') {
            throw new Error('CHUNK_TEST_ERROR');
        }
        this.nextChunkIdx++;
        return {
            data: chunk ? Buffer.from(chunk) : undefined,
            index: idx
        };
    }
}

class TestWritableRemoteStream implements IWritableRemoteStream {
    public chunks: IChunk[];

    constructor() {
        this.chunks = [];
    }

    public async writeChunk(chunk: IChunk) {
        this.chunks.push(chunk);
    }
}

function makeBufferReadable(buffer: Buffer): Readable {
    return new Readable({
        read() {
            this.push(buffer);
            this.push(null);
        }
    })
}

function makeBufferWritable(buffers: Buffer[], highWaterMark?: number): Writable {
    return new Writable({
        highWaterMark,
        write(chunk, _, cb) {
            if (chunk.toString() === 'ERROR') {
                return cb(new Error('TEST_ERROR'));
                //setTimeout(() => cb(new Error('TEST_ERROR')), 10);
            } else
            if (chunk.toString() === 'ASYNC_ERROR') {
                //process.nextTick(() => cb(new Error('ASYNC_TEST_ERROR')));
                setTimeout( () => cb(new Error('ASYNC ERROR')), 10);
            } else {
                buffers.push(chunk);
                cb();
            }
        }
    })
}

describe('Streaming - ReadableConsumer', () => {
    test('ReadableConsumer', async () => {
        const chunks: string[] = [
            'Hello',
            'World'
        ];
        const producerSource = new TestProducerSource(chunks);
        const producer = new SequentialReadableRemoteStreamConsumer(producerSource);

        const producedChunks: Buffer[] = [];
        for await (const chunk of producer.consume()) {
            if (!chunk) {
                break;
            }
            producedChunks.push(chunk);
        }
        expect(Buffer.concat(producedChunks).toString()).toEqual(chunks.join(''));
    });

    test('ReadableConsumerWithError', async () => {
        const chunks: string[] = [
            'Hello',
            'ERROR',
            'World'
        ];
        const producerSource = new TestProducerSource(chunks);
        const producer = new SequentialReadableRemoteStreamConsumer(producerSource);

        const producedChunks: Buffer[] = [];
        let error: unknown;
        try {
            for await (const chunk of producer.consume()) {
                if (!chunk) {
                    break;
                }
                producedChunks.push(chunk);
            }
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();
    });
});
    
describe('Streaming - ReadableProducer', () => {
    test('ReadableProducer', async () => {
        const data = 'HelloWorld';
        const input = makeBufferReadable(Buffer.from(data));
        const producer = new ReadableRemoteStreamProducer(input, 4);
        {
            const chunk = await producer.readChunk();
            expect(chunk.index).toBe(0);
            expect(chunk.data?.toString()).toBe('Hell');
        }
        {
            const chunk = await producer.readChunk();
            expect(chunk.index).toBe(1);
            expect(chunk.data?.toString()).toBe('oWor');
        }
        {
            const chunk = await producer.readChunk();
            expect(chunk.index).toBe(2);
            expect(chunk.data?.toString()).toBe('ld');
        }
        {
            const chunk = await producer.readChunk();
            expect(chunk.index).toBe(3);
            expect(chunk.data).toBeUndefined();
        }
        {
            const chunk = await producer.readChunk();
            expect(chunk.index).toBe(3);
            expect(chunk.data).toBeUndefined();
        }        
    });
});
describe('Streaming - WritableProducer', () => {
    test('WritableRemoteStreamProducer', async () => {
        const sink = new TestWritableRemoteStream();        
        const producer = new SequentialWritableRemoteStreamProducer(sink, 4);
        await producer.write(Buffer.from('H'));
        await producer.write(Buffer.from('ello'));
        await producer.write(Buffer.from('World'));
        await producer.end();

        {
            expect(sink.chunks[0].index).toBe(0);
            expect(sink.chunks[0].data?.toString()).toBe('Hell');
        }
        {
            expect(sink.chunks[1].index).toBe(1);
            expect(sink.chunks[1].data?.toString()).toBe('oWor');
        }
        {
            expect(sink.chunks[2].index).toBe(2);
            expect(sink.chunks[2].data?.toString()).toBe('ld');
        }
        {
            expect(sink.chunks[3].index).toBe(3);
            expect(sink.chunks[1].data).toBeUndefined;
        }
    });
});

describe('Streaming - WritableConsumer', () => {
    test('WritableRemoteStreamConsumer_InOrder', async () => {
        const buffers: Buffer[] = [];
        const sink = makeBufferWritable(buffers);
        const consumer = new WritableRemoteStreamConsumer(sink);
        await consumer.writeChunk({index: 0, data: Buffer.from('Hello')});
        await consumer.writeChunk({index: 1, data: Buffer.from('World')});
        await consumer.writeChunk({index: 2});
        expect(buffers[0].toString()).toBe('Hello');
        expect(buffers[1].toString()).toBe('World');
        expect(buffers[2]).toBe(undefined);
    });

    test('WritableRemoteStreamConsumer_RandomOrder', async () => {
        const buffers: Buffer[] = [];
        const sink = makeBufferWritable(buffers);
        const consumer = new WritableRemoteStreamConsumer(sink);
        const promises = [
            (async () => {
                await sleep(20);
                await consumer.writeChunk({index: 0, data: Buffer.from('Hello')});
            })(),
            (async () => {
                await sleep(10);
                await consumer.writeChunk({index: 1, data: Buffer.from('World')});        
            })(),
            (async () => {
                await consumer.writeChunk({index: 2});
            })()
        ];
        await Promise.all(promises);
        expect(buffers[0].toString()).toBe('Hello');
        expect(buffers[1].toString()).toBe('World');
        expect(buffers[2]).toBe(undefined);
    });

    test('WritableRemoteStreamConsumer_Draining', async () => {
        const buffers: Buffer[] = [];
        const sink = makeBufferWritable(buffers, 4);
        const consumer = new WritableRemoteStreamConsumer(sink);
        await consumer.writeChunk({index: 0, data: Buffer.from('Hello')});
        await consumer.writeChunk({index: 1, data: Buffer.from('World')});
        await consumer.writeChunk({index: 2});
        expect(buffers[0].toString()).toBe('Hello');
        expect(buffers[1].toString()).toBe('World');
        expect(buffers[2]).toBe(undefined);
    });

    test('WritableRemoteStreamConsumer_WithSyncError', async () => {
        const buffers: Buffer[] = [];
        const sink = makeBufferWritable(buffers);
        sink.on('error', () => { /* */ });
        const consumer = new WritableRemoteStreamConsumer(sink);
        await consumer.writeChunk({index: 0, data: Buffer.from('Hello')});
        let error: unknown;
        try {
            await consumer.writeChunk({index: 1, data: Buffer.from('ERROR')});
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();

        {
            expect(buffers[0].toString()).toBe('Hello');
            expect(buffers[1]).toBe(undefined);
        }
    });

    test('WritableRemoteStreamConsumer_WithAsyncError', async () => {
        const buffers: Buffer[] = [];
        const sink = makeBufferWritable(buffers);
        sink.on('error', () => { /* */ });
        const consumer = new WritableRemoteStreamConsumer(sink);
        await consumer.writeChunk({index: 0, data: Buffer.from('Hello')});
        await consumer.writeChunk({index: 1, data: Buffer.from('ASYNC_ERROR')});
        await sleep(100);
        
        {
            expect(buffers[0].toString()).toBe('Hello');
            expect(buffers[1]).toBe(undefined);
        }
    });



});
