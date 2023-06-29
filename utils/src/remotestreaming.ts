/**
 * Server-side                                   Client-side
 * ReadableStreamProducer     <---readChunk----  (Sequantial)WritableStreamConsumer
 * WritableStreamConsumer     <---writeChunk---  (Sequantial)WritableStreamProducer
 */
import { Readable, Writable } from 'stream';
import { Mutex } from '.';

const DEFAULT_CHUNK_SIZE = 500 * 1000;

export interface IChunk {
    /**
     * The data for the chunk. When not defined, indicates the end of the stream.
     */
    data?: Buffer;
    /**
     * Subsequent index number (starting at 0 for the first chunk)
     */
    index: number;
}

export interface IReadableRemoteStream {
    readChunk(): Promise<IChunk>;
}

export interface IWritableRemoteStream {
    writeChunk(chunk: IChunk): Promise<void>;
}

/**
 * Class that reads a readable stream one call at a time.
 */
export class SequentialReadableRemoteStreamConsumer {
    constructor(private source: IReadableRemoteStream) {}

    public async *consume() {
        let expectedIdx = 0;
        while (true) {
            const chunk = await this.source.readChunk();
            if (chunk.index !== expectedIdx) {
                throw new Error('STREAM_CORRUPT');
            }
            if (chunk.data === undefined) {
                return;
            }
            yield chunk.data;
            expectedIdx++;
        }
    }

    public readable() {
        return Readable.from(this.consume());
    }
}

/**
 * Class that takes a Readable as input, and provides a readChunk method that
 * can be called repeatedly to obtain chunks of data.
 * The implementation is thread-safe, which means that the `readChunk` can be called
 * multiple times in parallel. Internally, these parallel requests are handled sequentially
 * in unspecified order.
 */
export class ReadableRemoteStreamProducer implements IReadableRemoteStream {
    private nextChunkIndex: number;
    private finalized: boolean;
    private mutex: Mutex<void>;
    private onEnd?: () => void;

    constructor(private input: Readable, private chunkSize: number) {
        this.nextChunkIndex = 0;
        this.finalized = false;
        this.mutex = new Mutex();
        this.input.on('end', () => {
            this.finalized = true;
            this.onEnd?.();
        });
    }

    public async readChunk(): Promise<IChunk> {
        this.mutex.tryAcquire() || (await this.mutex.acquire());
        try {
            if (this.finalized) {
                return { index: this.nextChunkIndex };
            }
            const available = this.input.readableLength;
            const amount = Math.min(available, this.chunkSize);
            const data = this.input.read(amount);
            if (data !== null) {
                const index = this.nextChunkIndex;
                this.nextChunkIndex++;
                return { index, data };
            } else {
                const status = await new Promise<'readable' | 'ended'>((resolve) => {
                    this.input.once('readable', () => resolve('readable'));
                    this.onEnd = () => resolve('ended');
                });
                if (status === 'ended') {
                    return { index: this.nextChunkIndex };
                }
                const available = this.input.readableLength;
                const amount = Math.min(available, this.chunkSize);
                if (amount > 0) {
                    const data = this.input.read(amount);
                    const index = this.nextChunkIndex;
                    this.nextChunkIndex++;
                    return { index, data };
                } else {
                    this.finalized = true;
                    return { index: this.nextChunkIndex };
                }
            }
        } finally {
            this.mutex.release();
        }
    }
}

/**
 * Class that writes data to a writable stream one call at a time.
 */
export class SequentialWritableRemoteStreamProducer {
    private mutex: Mutex<void>;
    private nextWriteIndex: number;
    private buffers: Buffer[];

    constructor(private sink: IWritableRemoteStream, private chunkSize: number) {
        this.mutex = new Mutex();
        this.nextWriteIndex = 0;
        this.buffers = [];
    }

    public async write(data: Buffer) {
        this.mutex.tryAcquire() || (await this.mutex.tryAcquire());
        try {
            await this.writeImpl(data, false);
        } finally {
            this.mutex.release();
        }
    }

    public async flush() {
        this.mutex.tryAcquire() || (await this.mutex.tryAcquire());
        try {
            await this.writeImpl(undefined, true);
        } finally {
            this.mutex.release();
        }
    }

    public async end() {
        this.mutex.tryAcquire() || (await this.mutex.tryAcquire());
        try {
            await this.writeImpl(undefined, true);
            await this.sink.writeChunk({
                index: this.nextWriteIndex
            });
        } finally {
            this.mutex.release();
        }
    }

    private async writeImpl(data: Buffer | undefined, immediately = false) {
        const len = this.buffers.reduce((prev, curr) => prev + curr.length, 0) + (data?.length ?? 0);
        if (immediately || len >= this.chunkSize) {
            const buffer = data ? Buffer.concat([...this.buffers, data]) : Buffer.concat([...this.buffers]);
            this.buffers = [];
            let offset = 0;
            while (offset < buffer.length) {
                const slice = buffer.subarray(offset, offset + this.chunkSize);
                if (slice.length < this.chunkSize) {
                    if (!immediately) {
                        this.buffers.push(slice);
                        return;
                    }
                }
                await this.sink.writeChunk({
                    index: this.nextWriteIndex,
                    data: slice
                });
                offset += slice.length;
                this.nextWriteIndex++;
            }
        } else {
            if (data) {
                this.buffers.push(data);
            }
        }
    }
}

export interface ICachedChunk {
    chunk: IChunk;
    resolve: () => void;
    reject: (error: unknown) => void;
}

export class WritableRemoteStreamConsumer {
    private finalized: boolean;
    private nextWriteIndex: number;
    private cache: ICachedChunk[];
    private processCache?: () => void;

    constructor(private sink: Writable) {
        this.finalized = false;
        this.nextWriteIndex = 0;
        this.cache = [];
        setImmediate(() => this.loop());
    }

    public async writeChunk(chunk: IChunk) {
        if (this.finalized || !this.sink.writable) {
            throw new Error('STREAM_CLOSED');
        }

        return new Promise<void>((resolve, reject) => {
            this.cache.push({ chunk, resolve, reject });
            this.trigger();
        });
    }

    protected trigger() {
        if (this.processCache) {
            this.processCache();
        }
    }

    protected async loop() {
        let idx = 0;
        while (true) {
            if (this.finalized || !this.sink.writable) {
                this.finalized = true;

                for (const cached of this.cache) {
                    cached.reject(new Error('STREAM_CLOSED'));
                }
                // Break the loop.
                return;
            }

            const cachedIdx = this.cache.findIndex((x) => x.chunk.index === idx);
            if (cachedIdx < 0) {
                await new Promise<void>((resolve) => {
                    this.processCache = resolve;
                });
                this.processCache = undefined;
                continue;
            }

            const cached = this.cache[cachedIdx];
            const chunk = cached.chunk;
            this.cache.splice(cachedIdx, 1);

            if (chunk.data === undefined) {
                idx++;
                this.sink.end();
                this.finalized = true;
                cached.resolve();
                // Even though we are finalized, we must reject any pending cache items. So let's continue
                // and do this in the start of the next loop iteration.
                continue;
            }

            if (!this.sink.write(chunk.data)) {
                if (!this.sink.writable) {
                    this.finalized = true;
                    this.cache.push(cached);
                    continue;
                }
                await new Promise<void>((resolve) => {
                    this.sink.once('drain', () => resolve());
                });
            }

            idx++;
            cached.resolve();
        }
    }
}

export function createReadableRemoteStreamConsumer(source: IReadableRemoteStream) {
    return new SequentialReadableRemoteStreamConsumer(source);
}

export function createWritableRemoteStreamProducer(sink: IWritableRemoteStream, chunkSize?: number) {
    return new SequentialWritableRemoteStreamProducer(sink, chunkSize ?? DEFAULT_CHUNK_SIZE);
}
