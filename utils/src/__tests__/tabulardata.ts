import { ITabularColumn, TabularData } from '../tabulardata';

interface Data {
    Name?: string;
    Temperature?: number;
    Size?: number;
    Oxygen?: boolean;
}

describe('Tabular data', () => {
    test.each(['table', 'imported'])('Basic', (kind) => {
        const columns: ITabularColumn<Data>[] = [
            { name: 'Name', kind: 'text' },
            { name: 'Temperature', kind: 'fixed', precision: 2 },
            { name: 'Size', kind: 'float' },
            { name: 'Oxygen', kind: 'boolean' }
        ];

        const table = new TabularData(columns);

        expect(Array.from(table.getCursor('Name'))).toStrictEqual([]);

        table.addRecord({ Name: 'Earth', Temperature: 20.23, Oxygen: true });
        table.addRecord({ Name: 'Moon', Size: 234.56, Oxygen: false });
        table.addRecord({ Name: 'Unknown', Temperature: 3.14 });

       // const exported = table.export();
        //const imported = new TabularData(exported);

        const tab = kind === 'imported' ? new TabularData(table.export()) : table;
        expect(Array.from(tab.getCursor('Name'))).toStrictEqual(['Earth', 'Moon', 'Unknown']);
        expect(Array.from(tab.getCursor('Temperature'))).toStrictEqual([20.23, undefined, 3.14]);
        expect(Array.from(tab.getCursor('Size'))).toStrictEqual([undefined, 234.56, undefined]);
        expect(Array.from(tab.getCursor('Oxygen'))).toStrictEqual([true, false, undefined]);

        const multi = tab.getMultiCursor(['Name', 'Oxygen']);
        expect(Array.from(multi)).toStrictEqual([
            { Name: 'Earth', Oxygen: true },
            { Name: 'Moon', Oxygen: false },
            { Name: 'Unknown', Oxygen: undefined }
        ]);

        const multiFilterFirst = tab.getMultiCursor(['Name', 'Oxygen'], (name) => name === 'Earth');
        expect(Array.from(multiFilterFirst)).toStrictEqual([
            { Name: 'Earth', Oxygen: true }
        ]);

        const multiFilterMiddle = tab.getMultiCursor(['Name', 'Oxygen'], (name) => name === 'Moon');
        expect(Array.from(multiFilterMiddle)).toStrictEqual([
            { Name: 'Moon', Oxygen: false }
        ]);

        const multiFilterLast = tab.getMultiCursor(['Name', 'Oxygen'], (name) => name === 'Unknown');
        expect(Array.from(multiFilterLast)).toStrictEqual([
            { Name: 'Unknown', Oxygen: undefined }
        ]);

        const multiFilterNone = tab.getMultiCursor(['Name', 'Oxygen'], (_name) => false);
        expect(Array.from(multiFilterNone)).toStrictEqual([]);

        const multiFilterAll = tab.getMultiCursor(['Name', 'Oxygen'], (_name) => true);
        expect(Array.from(multiFilterAll)).toStrictEqual([
            { Name: 'Earth', Oxygen: true },
            { Name: 'Moon', Oxygen: false },
            { Name: 'Unknown', Oxygen: undefined }
        ]);
    });

    test('Nested', () => {
        interface IData {
            a?: string;
            b: {
                b0?: string;
                b1?: number;
            },
            c: {[key: string]: number}
        }

        const columns: ITabularColumn<IData>[] = [
            { name: 'a', kind: 'text' },
            { name: 'b.b0', kind: 'text' },
            { name: 'b.b1', kind: 'text' },
            { name: 'c.x.y', kind: 'text' }
        ];

        const table = new TabularData(columns);
        table.addRecord({
            a: 'World',
            b: {
                b0: 'Moon'
            },
            c: {
                Jupiter: 42
            }
        }, {recursionLevel: 2, onMissingColumn: (name) => ({name, kind: 'int'})});
        for (const item of table.getMultiCursor(table.getColumnNames())) {
            console.log('ITEM', item['b.b0']);
        }
    })

    test('Map', () => {
        const columns: ITabularColumn[] = [
            { name: 'Name', kind: 'text' },
            { name: 'Temperature', kind: 'fixed', precision: 2 },
            { name: 'Size', kind: 'float' },
            { name: 'Oxygen', kind: 'boolean' }
        ];
        const table = new TabularData(columns);
        table.addRecord({Name: 'World', Temperature: 12});
        for (const record of table.getMultiCursor()) {
            expect(record.Name).toBe('World');
            expect(record['Temperature']).toBe(12);
            expect(record['Bla']).toBeUndefined();  // Does not exist in columns
        }
    });

    test('Multiple imports', () => {
        interface A { ab?: string; a?: string }
        interface B { ab?: string; b?: string }

        const columnsA: ITabularColumn<A>[] = [
            { name: 'ab', kind: 'text' },
            { name: 'a', kind: 'text' }
        ];

        const columnsB: ITabularColumn<B>[] = [
            { name: 'ab', kind: 'text' },
            { name: 'b', kind: 'text' }
        ];
        
        const tableA = new TabularData(columnsA);
        tableA.addRecord({ab: '0-AB', a: '0-A'});
        tableA.addRecord({a: '1-A'});
        tableA.addRecord({ab: '2-AB'});
        tableA.addRecord({});
        
        const tableB = new TabularData(columnsB);
        tableB.addRecord({ab: '4-AB', b: '4-B'});
        tableB.addRecord({b: '5-B'});
        tableB.addRecord({ab: '6-AB'});
        tableB.addRecord({});
        
        const exportA = tableA.export();
        const exportB = tableB.export();

        const newA = new TabularData<A & B>(exportA);
        newA.import(exportB);
        const c = newA.getMultiCursor();
        expect(c.next().value).toStrictEqual({ab: '0-AB', a: '0-A', b: undefined});
        expect(c.next().value).toStrictEqual({ab: undefined, a: '1-A', b: undefined});
        expect(c.next().value).toStrictEqual({ab: '2-AB', a: undefined, b: undefined});
        expect(c.next().value).toStrictEqual({ab: undefined, a: undefined, b: undefined});

        expect(c.next().value).toStrictEqual({ab: '4-AB', a: undefined, b: '4-B'});
        expect(c.next().value).toStrictEqual({ab: undefined, a: undefined, b: '5-B'});
        expect(c.next().value).toStrictEqual({ab: '6-AB', a: undefined, b: undefined});
        expect(c.next().value).toStrictEqual({ab: undefined, a: undefined, b: undefined});

        expect(c.next().done).toBeTruthy();
    });

});
