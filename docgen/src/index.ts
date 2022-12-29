import { Generator, Html } from './generator';
import { ITsDocNode, TsdocParser } from './parser';
import * as fs from 'fs';

export function generate(source: string, dest: string) {
    const sourceContents = fs.readFileSync(source);
    const sourceJson = JSON.parse(sourceContents.toString()) as unknown as ITsDocNode;

    console.log(sourceJson);

    const parser = new TsdocParser();
    const data = parser.parse(sourceJson);
    const generator = new Generator();
    const html = new Html([dest], 'index.html');
    generator.generate(data, html);
    html.finalize();
}
