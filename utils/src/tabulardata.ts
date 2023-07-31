import { decodeIntNumberFromBuffer, decodeNumber, encodeNumber, isObject } from './util';

const KEY_SEPARATOR = '.';

export interface ITabularExportColValues {
    lastPos: number;
    n: number;
    buf: Buffer;
}

export interface ITabularExport<T extends object = { [key: string]: unknown }> {
    n: number;
    columns: ITabularColumn<T>[];
    values: ITabularExportColValues[];
}

export type TabularColumnKind = 'text' | 'int' | 'fixed' | 'float' | 'boolean' | 'json';
export type TabularColumnCompression = 'none' | 'rle';

export interface ITabularColumn<T extends object = { [key: string]: unknown }> {
    name: NestedKeyOf<T>;
    kind: TabularColumnKind;
    precision?: number;
    compression?: 'none' | 'rle';
    delimiter?: string;
}

interface IBufPos {
    buf: Buffer;
    pos: number;
}

const ASCII_HYPHEN = 45;
const ASCII_LOWER_T = 116;
const BUF_UNDEFINED = Buffer.from('-', 'ascii');

export interface ITabularCursorOptions {
    skip?: number;
}

export interface ITabularExportOptions<T extends object = { [key: string]: unknown }> {
    columns?: NestedKeyOf<T>[];
}

export interface ITabularAddOptions {
    onMissingColumn?: (name: string) => ITabularColumn | undefined;
    recursionLevel?: number;
}

// From: https://dev.to/pffigueiredo/typescript-utility-keyof-nested-object-2pa3
export type NestedKeyOf<T, K = keyof T> = K extends keyof T & (string | number)
    ? `${K}` | (T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : never)
    : never;

export type DictOf<T, U> = { [Property in NestedKeyOf<T>]: U };

export interface ITabularColumnValues {
    n: number;
    lastPos: number;
    len: number;
    buf: Buffer | Buffer[];
}

/**
 * Class that stores tabular data in memory and can export/import it to a serializable-efficient
 * data structure.
 *
 * It is similar to Apache Parquet, but simpler. And the schema (columns) is stored together with the
 * data, which makes it easier for readers to consume.
 *
 * Like Parquet, data is stored per column. Per column, an array of values (internally stored as a buffer)
 * is maintained. This makes it efficient to only request a subset (certain column) of the data. It also allows
 * more efficient storage (like RLE) which currently is not yet implemented.
 *
 * Only appending new data is supported. It is not possible to modify existing data. A record can be flat
 * (an ordinary object with fields) or nested. Nested arrays are not supported. Nested objects
 * are processed recursively and result in column names like `a.b.c`.
 *
 * Reading data is by means of a cursor. It is possible to obtain a cursor for one column ({@link getCursor})
 * or for multiple columns at once ({@link getMultiCursor}). The cursors are just iterators that iterate over
 * all records.
 *
 * For the multi-cursor, a filter expression can be supplied that is evaluated against the first cursor so that the other
 * cursors can be processed more eficiently (their values are only evaluated when the filter matches).
 */
export class TabularData<T extends object = { [key: string]: unknown }> {
    private values: Map<NestedKeyOf<T>, ITabularColumnValues>;
    private columns: ITabularColumn<T>[];
    private columnMap: Map<NestedKeyOf<T>, ITabularColumn<T>>;
    private n: number;

    constructor(source: ITabularColumn<T>[] | ITabularExport<T>) {
        this.values = new Map();
        this.columnMap = new Map();
        this.n = 0;
        if (Array.isArray(source)) {
            this.columns = source;
            for (const column of source) {
                this.columnMap.set(column.name, column);
            }
        } else {
            this.columns = [];
            this.import(source);
        }
    }

    public addRecord(struct: T, options?: ITabularAddOptions) {
        const values: { key: NestedKeyOf<T>; value: unknown }[] = [];
        this.extractValues(struct, '', values, options?.recursionLevel ?? 1);
        for (const keyValue of values) {
            let column = this.columnMap.get(keyValue.key);
            if (!column) {
                if (!options?.onMissingColumn) {
                    throw new Error(`Column [${keyValue.key}] not known and no onMissingColumn in the options`);
                }

                column = options.onMissingColumn?.(keyValue.key) as ITabularColumn<T> | undefined;
                if (!column) {
                    continue;
                }

                if (column) {
                    this.columns.push(column);
                    this.columnMap.set(column.name, column);
                }
            }

            const encoded = this.encodeValue(keyValue.value, column.kind, column.precision);
            let colvalues = this.values.get(column.name);
            if (colvalues === undefined) {
                colvalues = { n: 0, lastPos: -1, len: 0, buf: [] };
                this.values.set(column.name, colvalues);
            } else if (Buffer.isBuffer(colvalues.buf)) {
                colvalues.buf = [colvalues.buf];
            }

            this.completeValues(colvalues, this.n);

            colvalues.lastPos = colvalues.n;
            (colvalues.buf as Buffer[]).push(encoded);
            colvalues.len += encoded.length;
            colvalues.n++;
        }
        this.n++;
    }

    public *getCursor<C extends NestedKeyOf<T> | keyof T>(
        columnName: C,
        options?: ITabularCursorOptions
    ): Generator<(C extends keyof T ? T[C] : unknown) | undefined> {
        const column = this.columnMap.get(columnName as NestedKeyOf<T>);
        const n = this.n;
        if (column) {
            const values = this.values.get(columnName as NestedKeyOf<T>) ?? { n: 0, buf: Buffer.from([]) };
            if (values) {
                if (Array.isArray(values.buf)) {
                    values.buf = Buffer.concat(values.buf);
                }
                const buf: IBufPos = { buf: values.buf, pos: 0 };
                const len = buf.buf.length;
                let idx = 0;
                while (idx < n) {
                    if ((options?.skip ?? 0) > 0) {
                        const end = Math.min(n, idx + (options?.skip ?? 0));
                        while (idx < end && buf.pos < len) {
                            this.decodeValue(buf, column.kind, true);
                            idx++;
                        }
                        idx = end;
                        if (options) {
                            options.skip = undefined;
                        }
                    }

                    if (buf.pos >= len) {
                        idx++;
                        yield undefined;
                        continue;
                    }

                    const value = this.decodeValue(buf, column.kind, false) as (C extends keyof T ? T[C] : unknown) | undefined;
                    idx++;
                    yield value;
                }
                return;
            }
        }
        throw new Error('Column not found');
    }

    public *getMultiCursor<U>(columns?: NestedKeyOf<T>[], filter?: (value: U) => boolean): Generator<DictOf<T, unknown>> {
        if (columns === undefined) {
            columns = this.getColumnNames();
        }
        const options: ITabularCursorOptions = {};
        let skip = 0;
        const cursors = columns.map((key) => this.getCursor(key, options));

        while (true) {
            const firstCursorValue = cursors[0].next();
            if (firstCursorValue.done) {
                return;
            }
            const accept = !filter || filter(firstCursorValue.value as U);
            if (!accept) {
                skip++;
                continue;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {} as any;
            let idx = 0;
            for (const cursor of cursors) {
                if (idx > 0) {
                    options.skip = skip;
                    const value = cursor.next();
                    result[columns[idx]] = value.value;
                } else {
                    result[columns[0]] = firstCursorValue.value;
                }
                idx++;
            }
            yield result;
        }
    }

    public export(options?: ITabularExportOptions<T>): ITabularExport<T> {
        const exportedValues: ITabularExportColValues[] = [];
        const cols = options?.columns?.map((c) => this.columnMap.get(c) ?? c) ?? this.columns;
        for (const column of cols) {
            if (typeof column === 'string') {
                throw new Error(`No such column: ${column}`);
            }
            const values = this.values.get(column.name);
            if (!values) {
                throw new Error('No values for column');
            }
            exportedValues.push({
                lastPos: values.lastPos,
                n: values.n,
                buf: Array.isArray(values.buf) ? Buffer.concat(values.buf) : values.buf
            });
        }
        return {
            columns: this.columns,
            values: exportedValues,
            n: this.n
        };
    }

    public import(data: ITabularExport<T>) {
        if (data.columns === undefined) {
            throw new Error('Corrupt tabular export');
        }

        for (const column of data.columns) {
            if (this.columnMap.has(column.name)) {
                continue;
            }
            this.columns.push(column);
            this.columnMap.set(column.name, column);
        }

        let colidx = -1;
        for (const column of data.columns) {
            colidx++;
            const values = data.values[colidx];
            if (!values) {
                continue;
            }

            let currentValues = this.values.get(column.name);
            if (!currentValues) {
                currentValues = { buf: [], len: 0, lastPos: -1, n: 0 };
                this.values.set(column.name, currentValues);
            }

            if (Buffer.isBuffer(currentValues.buf)) {
                currentValues.buf = [currentValues.buf];
            }

            this.completeValues(currentValues, this.n);

            if (Array.isArray(currentValues.buf)) {
                currentValues.buf.push(values.buf);
            } else {
                currentValues.buf = [currentValues.buf, values.buf];
            }
            currentValues.lastPos = currentValues.n + values.lastPos;
            currentValues.len += values.buf.length;
            currentValues.n += values.n;
        }
        this.n += data.n;
    }

    public getColumnNames(): NestedKeyOf<T>[] {
        return this.columns.map((c) => c.name);
    }

    private completeValues(values: ITabularColumnValues, n: number) {
        if (values.n < n) {
            while (values.n < n) {
                values.lastPos = values.len;
                (values.buf as Buffer[]).push(BUF_UNDEFINED);
                values.n++;
                values.len += BUF_UNDEFINED.length;
            }
        }
    }

    private encodeValue(value: unknown, kind: TabularColumnKind, precision: number | undefined): Buffer {
        if (value === undefined) {
            return BUF_UNDEFINED;
        }

        switch (kind) {
            case 'boolean':
                return (value as boolean) ? Buffer.from('t', 'ascii') : Buffer.from('f', 'ascii');
            case 'text':
                return encodeText(value as string, 'utf8');
            case 'fixed':
                return encodeText(encodeNumber(value as number, precision), 'ascii');
            case 'float':
                return encodeText((value as number).toString(), 'ascii');
            case 'int':
                return Buffer.from(encodeNumber(value as number), 'ascii');
            case 'json':
                return encodeText(JSON.stringify(value), 'utf8');
        }
    }

    private decodeValue(buf: IBufPos, kind: TabularColumnKind, skip: boolean): unknown {
        const v = buf.buf[buf.pos];
        if (v === ASCII_HYPHEN) {
            buf.pos++;
            return;
        }

        switch (kind) {
            case 'boolean': {
                buf.pos++;
                return v === ASCII_LOWER_T;
            }
            case 'text': {
                return decodeText(buf, 'utf8', skip);
            }
            case 'fixed':
                if (skip) {
                    decodeText(buf, 'ascii', true);
                    return;
                }
                return decodeNumber(decodeText(buf, 'ascii', false));
            case 'float': {
                if (skip) {
                    decodeText(buf, 'ascii', skip);
                    return;
                }
                return parseFloat(decodeText(buf, 'ascii', false));
            }
            case 'int':
                return decodeIntNumberFromBuffer(buf, skip);
            case 'json': {
                if (skip) {
                    decodeText(buf, 'ascii', true);
                    return;
                }
                return JSON.parse(decodeText(buf, 'utf8', false));
            }
        }
    }

    private extractValues(data: unknown, path: string, values: { key: string; value: unknown }[], level: number) {
        if (level === 0) {
            values.push({ key: path, value: data });
            return;
        }
        if (isObject(data)) {
            for (const [key, value] of Object.entries(data as { [key: string]: unknown })) {
                const p = path ? [path, key].join(KEY_SEPARATOR) : key;
                this.extractValues(value, p, values, level - 1);
            }
        } else {
            values.push({ key: path, value: data });
        }
    }
}

function encodeText(value: string, encoding: 'ascii' | 'utf8') {
    const buf = Buffer.from(value, encoding);
    const len = encodeNumber(buf.length);
    return Buffer.concat([Buffer.from(len, 'ascii'), buf]);
}

function decodeText(buf: IBufPos, encoding: 'ascii' | 'utf8', skip: boolean) {
    const len = decodeIntNumberFromBuffer(buf, false);
    if (skip) {
        return '';
    }
    const p = buf.pos;
    buf.pos += len;
    return buf.buf.toString(encoding, p, buf.pos);
}
