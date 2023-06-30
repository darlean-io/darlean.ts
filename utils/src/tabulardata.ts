import { isObject } from './util';

const KEY_SEPARATOR = '.';
const DEFAULT_DELIMITER = '\t';

export interface ITabularExport {
    n: number;
    columns: ITabularColumn[];
    values: string[];
}

export type TabularColumnKind = 'text' | 'int' | 'fixed' | 'float' | 'boolean';
export type TabularColumnCompression = 'none' | 'rle';

export interface ITabularColumn {
    name: string;
    kind: TabularColumnKind;
    precision?: number;
    compression?: 'none' | 'rle';
    delimiter?: string;
}

/**
 * Class that stores tabular data in memory and can export/import it to a serializable-efficient
 * data structure.
 *
 * It is similar to Apache Parquet, but simpler. And the schema (columns) is stored together with the
 * data, which makes it easier for readers to consume.
 *
 * Like Parquet, data is stored per column. Per column, an array of values is maintained. This makes it
 * efficient to only request a subset (certain column) of the data. It also allows more efficient storage
 * (like RLE) which currently is not yet implemented.
 *
 * Only appending new data is supported. It is not possible to modify existing data. A record can be flat
 * (an ordinary object with fields) or nested. Nested arrays are currently not supported. Nested objects
 * are processed recursively and result in column names like `a.b.c`.
 *
 * Reading data is by means of a cursor. It is possible to obtain a cursor for one column ({@link getCursor})
 * or for multiple columns at once ({@link getMultiCursor}). The cursors are just iterators that iterate over
 * all records.
 */
export class TabularData {
    private values: Map<string, (string | undefined | number)[]>;
    private columns: ITabularColumn[];
    private n: number;

    constructor(source: ITabularColumn[] | ITabularExport) {
        this.values = new Map();
        this.n = 0;
        if (Array.isArray(source)) {
            this.columns = source;
            for (const column of this.columns) {
                this.values.set(column.name, []);
            }
        } else {
            this.columns = [];
            this.import(source);
        }
    }

    public addRecord(struct: unknown) {
        const values: { key: string; value: unknown }[] = [];
        this.extractValues(struct, '', values);
        for (const column of this.columns) {
            const idx = values.findIndex((v) => v.key === column.name);
            const value = values[idx]?.value;
            const encoded = this.encodeValue(value, column.kind, column.precision);
            const colvalues = this.values.get(column.name);
            colvalues?.push(encoded);
        }
        this.n++;
    }

    public *getCursor(key: string) {
        const column = this.columns.find((x) => x.name === key);
        const n = this.n;
        if (column) {
            const values = this.values.get(key);
            if (values) {
                for (let idx = 0; idx < n; idx++) {
                    const v = values[idx];
                    if (v === undefined) {
                        yield undefined;
                    } else {
                        if (typeof v !== 'string') {
                            console.log('V', v);
                            throw new Error('Value type not supported');
                        }
                        const value = this.decodeValue(v, column.kind);
                        yield value;
                    }
                }
                return;
            }
        }
        throw new Error('Column not found');
    }

    public *getMultiCursor(keys: string[]) {
        const cursors = keys.map((key) => this.getCursor(key));

        while (true) {
            const values: (number | string | boolean | undefined)[] = [];
            for (const cursor of cursors) {
                const value = cursor.next();
                if (value.done) {
                    return;
                }
                values.push(value.value);
            }
            yield values;
        }
    }

    public export(): ITabularExport {
        const exportedValues: string[] = [];
        for (const column of this.columns) {
            const values = this.values.get(column.name);
            if (!values) {
                throw new Error('No values for column');
            }
            const exported = values?.map((v) => {
                switch (typeof v) {
                    case 'undefined':
                        return '';
                    case 'string':
                        return 's' + v;
                    case 'number':
                        return 'n' + v.toString();
                }
            });
            exportedValues.push(exported.join(column.delimiter ?? DEFAULT_DELIMITER));
        }
        return {
            columns: this.columns,
            values: exportedValues,
            n: this.n
        };
    }

    public import(data: ITabularExport) {
        this.columns = data.columns;
        this.n = data.n;
        this.values.clear();
        let idx = 0;
        for (const column of this.columns) {
            const values = data.values[idx];
            const splitted = values.split(column.delimiter ?? DEFAULT_DELIMITER);
            const remapped = splitted.map((x) => {
                if (x === '') {
                    return undefined;
                }
                return x.slice(1);
            });
            this.values.set(column.name, remapped);
            idx++;
        }
    }

    private encodeValue(value: unknown, kind: TabularColumnKind, precision: number | undefined): string | undefined {
        if (value === undefined) {
            return undefined;
        }

        switch (kind) {
            case 'boolean':
                return (value as boolean) ? 't' : 'f';
            case 'text':
                return value as string;
            case 'fixed':
                return (value as number).toFixed(precision);
            case 'float':
                return (value as number).toString();
            case 'int':
                return (value as number).toString();
        }
    }

    private decodeValue(value: string | undefined, kind: TabularColumnKind): string | boolean | number | undefined {
        if (value === undefined) {
            return undefined;
        }

        switch (kind) {
            case 'boolean':
                return value === 't';
            case 'text':
                return value;
            case 'fixed':
                return parseFloat(value);
            case 'float':
                return parseFloat(value);
            case 'int':
                return parseInt(value);
        }
    }

    private extractValues(data: unknown, path: string, values: { key: string; value: unknown }[]) {
        if (isObject(data)) {
            for (const [key, value] of Object.entries(data as { [key: string]: unknown })) {
                const p = path ? [path, key].join(KEY_SEPARATOR) : key;
                this.extractValues(value, p, values);
            }
        } else {
            values.push({ key: path, value: data });
        }
    }
}
