import { ITabularColumn, TabularData } from '../tabulardata';

describe('Tabular data', () => {
    test.each(['table', 'imported'])('Basic', (kind) => {
        const columns: ITabularColumn[] = [
            { name: 'Name', kind: 'text' },
            { name: 'Temperature', kind: 'fixed', precision: 2 },
            { name: 'Size', kind: 'float' },
            { name: 'Oxygen', kind: 'boolean' }
        ];

        const table = new TabularData(columns);

        expect(Array.from(table.getCursor('Name'))).toStrictEqual([]);

        table.addRecord({ Name: 'Earth', Temperature: 20.23, Size: 12345.678, Oxygen: true });
        table.addRecord({ Name: 'Moon', Temperature: -12.34223, Size: 234.56, Oxygen: false });
        table.addRecord({ Name: 'Unknown' });

        const exported = table.export();
        const imported = new TabularData(exported);

        console.log(exported);

        const tab = kind === 'imported' ? imported : table;
        expect(Array.from(tab.getCursor('Name'))).toStrictEqual(['Earth', 'Moon', 'Unknown']);
        expect(Array.from(tab.getCursor('Temperature'))).toStrictEqual([20.23, -12.34, undefined]);
        expect(Array.from(tab.getCursor('Size'))).toStrictEqual([12345.678, 234.56, undefined]);
        expect(Array.from(tab.getCursor('Oxygen'))).toStrictEqual([true, false, undefined]);

        const multi = tab.getMultiCursor(['Name', 'Oxygen']);
        expect(Array.from(multi)).toStrictEqual([
            ['Earth', true],
            ['Moon', false],
            ['Unknown', undefined]
        ]);
    });
});
