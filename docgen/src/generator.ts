import * as fs from 'fs';
import { replaceAll } from './util';
import { getCanonicalParts, ISummaryItem, ITsDocNode, ITsDocType, TsDocData } from './parser';
import * as marked from 'marked';
import * as highlight from 'highlight.js';

const IGNORED_REFERENCES = ['string', 'number', 'Promise', 'void', 'Map', 'Function', 'Object', 'boolean', 'unknown'];
const BLOCK_KEYS = ['returns', 'throws', 'remarks', 'see'];

export class Html {
    protected lines: string[];
    protected stack: string[];
    protected path: string[];
    protected file: string;

    constructor(path: string[], file: string) {
        this.lines = [];
        this.stack = [];
        this.path = path;
        this.file = file;
    }

    public sub(path: string, file: string) {
        return new Html([...this.path, path], file);
    }

    public start(tag: string, clazz?: string, args?: { [key: string]: string }) {
        // TODO: Harden this!!
        const argsString = args
            ? ' ' +
              Object.entries(args ?? {})
                  .map(([k, v]) => `${k}="${v}"`)
                  .join(' ')
            : '';
        const clazzString = clazz ? ' ' + `class="${clazz}"` : '';
        this.lines.push(`<${tag}${clazzString}${argsString}>`);
        this.stack.push(tag);

        if (tag === 'html') {
            this.start('head');
            this.raw('<link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.7.0/styles/default.min.css">');
            this.start('style');
            // The margin-bottom ensures that #links to items on bottom of page are still kindof displayed on top.
            this.raw("body {font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif; font-size: 14px; margin-bottom: 80vh;}");
            this.raw(
                'th, td { vertical-align: top; text-align: left; padding-top: 8px; padding-bottom: 7px; padding-left: 3px; padding-right: 3px; }'
            );
            this.raw('div.break { padding-bottom: 1rem; }');
            this.raw('thead > tr {background: #CCC; font-weight: bold;}');
            this.raw('tbody > tr:nth-child(even) {background: #EEE}');
            this.raw('tbody > tr:nth-child(odd) {background: #FFF}');
            this.raw(
                '.summary h2 {background: #FA0; padding-left: 12px; padding-right: 12px; padding-top: 5px; padding-bottom: 5px; display: inline-block; margin-bottom: 0px;}'
            );
            this.raw('.comment h2 {background: none}');
            // this.raw('.comment {font-family: \'DejaVu Serif\', Georgia, "Times New Roman", Times, serif; font-size: 16px;}');
            this.raw('.comment {font-size: 86%;}');
            this.raw('a {font-weight: bold; text-decoration: none; }');
            this.raw('a, a:hover, a:visited, a:active { color: #FA0; }');
            this.raw(
                ".comment a {font-family: 'DejaVu Sans', Arial, Helvetica, sans-serif; text-decoration: none; font-weight: normal; }"
            );
            this.raw('.details { margin-left: 3rem; }');
            this.raw('table {border-spacing: 0px; border-collapse: collapse; width: 100%;}');
            this.raw('pre { margin-left: 1.5rem; }');

            this.raw('h2, h3 { padding-top: 2rem; }');
            this.raw('li { margin-top: 0.3rem; margin-bottom: 0.3rem; }');

            this.raw('.documentation { max-width: 1024px; margin: 0 auto; }');

            this.raw(
                '.navigator { position: sticky; top: 0px; background: rgba(250, 250, 250, 0.8); padding-left: 1rem; padding-right: 1rem; padding-top: 0.5rem; padding-bottom: 0.5rem; }'
            );

            this.raw('.breadcrumb { font-size: smaller }');

            this.raw('.chevron { font-size: smaller; color: #888; }');

            this.raw('.intro {font-weight: bold;}');

            this.end(); // style
            this.end(); // head
        }
    }

    public end() {
        const tag = this.stack.pop();
        this.lines.push(`</${tag}>`);
    }

    public text(value: string) {
        value = replaceAll(value, '<', '&lt;');
        value = replaceAll(value, '>', '&gt;');
        value = replaceAll(value, '\r', '');
        value = replaceAll(value, '\n\n', '<div class="break"></div>');
        this.lines.push(value);
    }

    public raw(value: string) {
        this.lines.push(value);
    }

    public tag(tag: string, clazz: string | undefined, text: string | undefined, atts?: { [name: string]: string }) {
        this.start(tag, clazz, atts);
        if (text) {
            this.text(text);
        }
        this.end();
    }

    public link(to: string, text: string) {
        this.lines.push(`<a href="${to}">`);
        this.text(text);
        this.lines.push('</a>');
    }

    public linkToNode(base: string, ref: string, text: string) {
        const normalizedBase = replaceAll(base, '/', '_');

        const to = `${normalizedBase}.html#${ref}`;
        this.link(to, text);
    }

    public finalize() {
        let item = this.stack.pop();
        while (item) {
            this.end();
            item = this.stack.pop();
        }

        const path = this.path.filter((x) => !!x).join('/');
        fs.mkdirSync(path, { recursive: true });
        const file = [path, this.file].join('/');
        console.log('FILE', file, this.path, this.file);
        fs.writeFileSync(file, this.lines.join(''));
    }
}

export class Generator {
    // protected externalPackages
    public generate(data: TsDocData, html: Html) {
        this.generatePackageModule(data, html, data.byId(0));
    }

    public generatePackageModule(data: TsDocData, html: Html, node: ITsDocNode) {
        html.start('html');
        html.start('body');
        this.generateNavigator(html, node);
        html.start('div', 'documentation');

        const isPackage = node.id === 0;
        const packmod = isPackage ? 'Package' : 'Module';

        html.tag('h1', undefined, isPackage ? `Package ${node.name}` : `Module ${node.name}`);

        //if (node.parent) {
        //    this.generateBreadCrumb(html, node);
        //}

        const byKind = isPackage
            ? (kind: string) => data.byKind(kind)
            : (kind: string) => node.children?.filter((x) => x.kindString === kind) ?? [];

        this.generateComment(html, node, data);

        if (node.comment?.summary) {
            html.start('div');
            html.text('See: ');
            html.link('#description', 'Description');
            html.end();
        }

        html.start('div', 'summary');

        if (isPackage) {
            for (const kindName of ['Module']) {
                const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
                if (items.length > 0) {
                    html.tag('h2', undefined, `${kindName} summary`);

                    html.start('table');
                    html.start('thead');
                    html.start('tr');
                    html.tag('th', undefined, kindName);
                    html.tag('th', undefined, 'Description');
                    html.end();
                    html.end();

                    for (const item of items) {
                        const link = replaceAll(item.name, '/', '_') + '.html';
                        html.start('tr');
                        html.start('td');
                        html.link(link, item.name);
                        html.end(); // td
                        html.start('td');
                        this.generateComment(html, item, data);
                        html.end(); // td
                        html.end();

                        const moduleHtml = html.sub('', link);
                        this.generatePackageModule(data, moduleHtml, item);
                        moduleHtml.finalize();
                    }
                    html.end(); // table
                }
            }
        }

        for (const kindName of ['Interface', 'Class']) {
            const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length > 0) {
                html.tag('h2', undefined, `${kindName} summary`);

                html.start('table');
                html.start('thead');
                html.start('tr');
                html.tag('th', undefined, kindName);
                html.tag('th', undefined, 'Description');
                html.end();
                html.end();

                for (const item of items) {
                    const link = `${item.name}.html`;
                    html.start('tr');
                    html.start('td');
                    html.link(link, item.name);
                    html.end(); // td
                    html.start('td');
                    this.generateComment(html, item, data);
                    html.end(); // td
                    html.end();

                    const itemHtml = html.sub('', link);
                    this.generateObjectInterface(item, itemHtml);
                    itemHtml.finalize();
                }
                html.end(); // table
            }
        }

        for (const kindName of ['Function']) {
            const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length > 0) {
                html.tag('h2', undefined, `${kindName} summary`);

                html.start('table');
                html.start('thead');
                html.start('tr');
                html.tag('th', undefined, 'Modifier');
                html.tag('th', undefined, kindName);
                html.end();
                html.end();

                for (const item of items) {
                    //const modifier = item.flags?.isProtected ? 'protected' :
                    //    item.flags?.isPrivate ? 'private' : 'public';
                    for (const sig of item.signatures ?? []) {
                        const asnc = sig.type?.name === 'Promise' ? 'async' : '';
                        html.start('tr');
                        html.start('td');
                        html.start('code');
                        html.text(asnc);
                        html.end();
                        html.end();

                        html.start('td', undefined);
                        html.start('div', 'function-signature');
                        html.start('code');
                        this.generateLink(html, data, item.parent, item.id, item.name);
                        this.generateSignature(html, sig, data, item);
                        html.text(': ');
                        this.generateType(html, sig.type, data, item);

                        html.end(); // code
                        html.end(); // div
                        html.start('div', 'function-description');
                        this.generateComment(html, sig, data);
                        html.end(); // div
                        html.end(); // td

                        html.end(); // tr
                    }
                }
                html.end(); // table
            }
        }

        for (const kindName of ['Type alias']) {
            const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length > 0) {
                html.tag('h2', undefined, `${kindName} summary`);

                html.start('table');
                html.start('thead');
                html.start('tr');
                html.tag('th', undefined, 'Alias');
                html.tag('th', undefined, 'Type');
                html.end();
                html.end();

                for (const item of items) {
                    html.start('tr');

                    html.start('td');
                    html.start('code');
                    this.generateLink(html, data, item.parent, item.id, item.name);
                    if (item.typeParameters && item.typeParameters.length > 0) {
                        html.text('<');
                        let first = true;
                        for (const arg of item.typeParameters) {
                            if (!first) {
                                html.text(', ');
                            }
                            first = false;
                            this.generateType(html, arg, data, item);
                        }
                        html.text('>');
                    }

                    html.end();
                    html.end();

                    html.start('td', undefined);
                    html.start('div', 'type-alias-signature');
                    html.start('code');
                    this.generateType(html, item.type, data, item);

                    html.end(); // code
                    html.end(); // div
                    html.start('div', 'type-alias-description');
                    this.generateComment(html, item, data);
                    html.end();
                    html.end(); // td

                    html.end(); // tr
                }
                html.end(); // table
            }
        }

        html.end();

        html.tag('h2', undefined, `${packmod} ${node.name} Description`, { id: 'description' });
        html.start('div', 'details');
        this.generateComment(html, node, data, false);
        html.end(); // div

        for (const kindName of ['Function']) {
            const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length > 0) {
                html.tag('h2', undefined, `${kindName} details`);

                for (const item of items) {
                    //const modifier = item.flags?.isProtected ? 'protected' :
                    //    item.flags?.isPrivate ? 'private' : 'public';
                    for (const sig of item.signatures ?? []) {
                        const asnc = sig.type?.name === 'Promise' ? 'async' : '';
                        html.start('h3', undefined, { id: item.name });
                        html.text(item.name);
                        html.end();

                        html.start('div', 'details');

                        html.start('code', undefined);
                        html.text(asnc);
                        html.text(item.name);
                        this.generateSignature(html, sig, data, item);
                        html.text(': ');
                        this.generateType(html, sig.type, data, item);
                        html.end(); // code

                        html.start('div', 'function-description');
                        this.generateComment(html, sig, data, false);
                        html.end(); // descr
                        html.end(); // details
                    }
                }
            }
        }

        for (const kindName of ['Type alias']) {
            const items = byKind(kindName).sort((a, b) => a.name.localeCompare(b.name));
            if (items.length > 0) {
                html.tag('h2', undefined, `${kindName} details`);

                for (const item of items) {
                    //const modifier = item.flags?.isProtected ? 'protected' :
                    //    item.flags?.isPrivate ? 'private' : 'public';
                    html.start('h3', undefined, { id: item.name });
                    {
                        html.text(item.name);
                        if (item.typeParameters && item.typeParameters.length > 0) {
                            html.text('<');
                            let first = true;
                            for (const arg of item.typeParameters) {
                                if (!first) {
                                    html.text(', ');
                                }
                                first = false;
                                this.generateType(html, arg, data, item);
                            }
                            html.text('>');
                        }
                    }
                    html.end(); // h3

                    html.start('div', 'details');

                    html.start('div', 'type-alias-signature');
                    html.start('code');
                    this.generateType(html, item.type, data, item);
                    html.end(); // code
                    html.end(); // div

                    html.start('div', 'type-alias-description');
                    this.generateComment(html, item, data, false);
                    html.end();

                    html.end(); // details
                }
            }
        }
    }

    protected generateHierarchy(html: Html, node: ITsDocNode, title: string, items: ITsDocType[]) {
        if (items && items.length > 0) {
            html.tag('h2', undefined, title);
            let first = true;
            for (const item of items.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
                if (!first) {
                    html.text(', ');
                }
                first = false;
                this.generateType(html, item, node.data, node);
            }
        }
    }

    protected generateHierarchy2(html: Html, node: ITsDocNode, title: string, items: ITsDocNode[]) {
        if (items && items.length > 0) {
            html.tag('h2', undefined, title);
            let first = true;
            for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
                if (!first) {
                    html.text(', ');
                }
                first = false;
                this.generateLink(html, node.data, node, -1, item.name);
            }
        }
    }

    protected generateObjectInterface(node: ITsDocNode, html: Html) {
        html.start('html');
        html.start('body');
        this.generateNavigator(html, node);
        html.start('div', 'documentation');

        html.tag('h1', undefined, `${node.kindString} ${node.name}`);

        //if (node.parent) {
        //    this.generateBreadCrumb(html, node);
        //}

        if (node.kindString === 'Interface') {
            this.generateHierarchy(html, node, 'All Superinterfaces', node.implementedTypes);
            if (node.data) {
                this.generateHierarchy2(html, node, 'All Known Subinterfaces', node.data.findExtenders(node.name));
                this.generateHierarchy2(html, node, 'All Known Implementing Classes', node.data.findImplementors(node.name));
            }
        } else {
            this.generateHierarchy(html, node, 'All Implemented Interfaces', node.implementedTypes);
            this.generateHierarchy(html, node, 'Extends from', node.extendedTypes);
            if (node.data) {
                this.generateHierarchy2(html, node, 'All Known Subclasses', node.data.findExtenders(node.name));
            }
        }

        html.tag('hr', undefined, undefined);
        this.generateComment(html, node, node.data, false);

        // Constructor and Methods
        for (const kind of ['Constructor', 'Method']) {
            const methods = node.children?.filter((x) => x.kindString === kind) ?? [];
            if (methods.length > 0) {
                html.tag('h2', undefined, `${kind} summary`);
                html.start('table');
                html.start('thead');
                html.start('tr');
                html.tag('th', undefined, 'Modifier');
                html.tag('th', undefined, 'Method and Description');
                html.end();
                html.end();

                for (const child of methods.sort((a, b) => a.name.localeCompare(b.name))) {
                    const modifier = child.flags?.isProtected ? 'protected' : child.flags?.isPrivate ? 'private' : 'public';

                    for (const sig of child.signatures ?? []) {
                        const asnc = sig.type?.name === 'Promise' ? 'async' : '';

                        html.start('tr');
                        html.start('td');
                        html.start('code');
                        html.text(`${[modifier, asnc].join(' ')}`);
                        html.end(); // code
                        html.end(); // td

                        html.start('td', undefined);
                        html.start('div', 'method-signature');
                        html.start('code');
                        if (kind === 'Constructor') {
                            this.generateType(html, sig.type, node.data, child, child.name);
                        } else {
                            html.link(`#${child.name}`, child.name);
                        }
                        this.generateSignature(html, sig, node.data, child);

                        if (kind !== 'Constructor') {
                            html.text(': ');
                            this.generateType(html, sig.type, node.data, child);
                        }

                        html.end(); // code
                        html.end(); // div
                        html.start('div', 'method-description');
                        this.generateComment(html, sig, node.data);
                        html.end();
                        html.end(); // td

                        html.end(); // tr
                    }
                }
                html.end(); // table
            }
        }

        // Fields
        const fields = node.children?.filter((x) => x.kindString === 'Property') ?? [];
        if (fields.length > 0) {
            html.tag('h2', undefined, 'Field summary');
            html.start('table');
            html.start('thead');
            html.start('tr');
            html.tag('th', undefined, 'Modifier');
            html.tag('th', undefined, 'Field and Description');
            html.end();
            html.end();

            for (const child of fields.sort((a, b) => a.name.localeCompare(b.name))) {
                const modifier = child.flags?.isProtected ? 'protected' : child.flags?.isPrivate ? 'private' : 'public';
                const optional = child.flags?.isOptional ? '?' : '';
                html.start('tr');
                html.start('td');
                html.start('code');
                html.text(`${modifier} `);
                html.end(); // code
                html.end(); // td
                html.start('td', undefined);
                html.start('div', 'field-signature');
                html.start('code');
                html.text(`${child.name}${optional}`);
                html.text(': ');
                this.generateType(html, child.type, child.data, child);
                html.end(); // code
                html.end(); // div
                html.start('div', 'field-description');
                this.generateComment(html, child, node.data);
                html.end();
                html.end(); // td
                html.end(); // tr
            }
            html.end(); // table
        }

        for (const kind of ['Constructor', 'Method']) {
            const items = (node.children?.filter((x) => x.kindString === kind) ?? []).sort((a, b) =>
                a.name.localeCompare(b.name)
            );
            if (items.length > 0) {
                html.tag('h2', undefined, `${kind} details`);

                for (const item of items) {
                    const modifier = item.flags?.isProtected ? 'protected' : item.flags?.isPrivate ? 'private' : 'public';
                    for (const sig of item.signatures ?? []) {
                        const asnc = sig.type?.name === 'Promise' ? 'async' : '';
                        html.start('h3', undefined, { id: item.name });
                        html.text(item.name);
                        html.end(); // h3
                        html.start('div', 'details');
                        html.start('code');
                        html.text([modifier, asnc, item.name].join(' '));
                        this.generateSignature(html, sig, node.data, item);
                        html.text(': ');
                        this.generateType(html, sig.type, node.data, item);
                        html.end(); // code
                        html.start('div', 'function-description');
                        this.generateComment(html, sig, node.data, false);
                        html.end(); // descr

                        html.end(); // details
                    }
                }
            }
        }
    }

    protected generateLink(
        html: Html,
        data: TsDocData | undefined,
        scope: ITsDocNode | undefined,
        id: number,
        name: string | undefined,
        text?: string
    ) {
        // @decorator -> decorator
        const normalizedName = name?.startsWith('@') ? name.slice(1) : name || '';
        //const node = id >= 0 ? data?.tryById(id) : name ? data?.tryByName(normalizedName) : undefined;
        const node = name ? data?.tryByCanonical(scope, name) ?? data?.tryByCanonical(scope, normalizedName) : undefined;
        if (!node) {
            html.text(text || name || '');
            if (!IGNORED_REFERENCES.includes(name || '')) {
                console.log('Reference not found:', id, name);
            }
            return;
        }
        if (!node.kindString) {
            html.linkToNode('index', '', text || name || node.name);
        } else if (node.kindString === 'Method' || node.kindString === 'Property') {
            html.linkToNode(node.parent?.name ?? '', node.name, text || name || node.name || '');
        } else if (node.kindString === 'Class' || node.kindString === 'Interface') {
            html.linkToNode(node.name, '', text || name || node.name);
        } else if (node.kindString === 'Function' || node.kindString === 'Type alias') {
            html.linkToNode(node.parent?.name ?? '', node.name, text || name || node.name);
        } else if (node.kindString === 'Module') {
            html.linkToNode(node.name, '', text || name || node.name);
        } else {
            html.text(text || name || '');
        }
    }

    protected generateType(
        html: Html,
        t: ITsDocType | undefined,
        data: TsDocData | undefined,
        scope: ITsDocNode | undefined,
        link: boolean | string = true
    ) {
        if (!t) {
            html.text('void');
            return;
        } else if (t.type === 'array') {
            if (t.elementType) {
                this.generateType(html, t.elementType, data, scope);
            }
            html.text('[]');
        } else if (t.type === 'union') {
            let first = true;
            for (const item of t.types ?? []) {
                if (!first) {
                    html.text(' | ');
                }
                first = false;
                this.generateType(html, item, data, scope);
            }
        } else if (t.type === 'reflection') {
            if (t.declaration?.indexSignature) {
                const key = t.declaration?.indexSignature?.parameters;
                const value = t.declaration?.indexSignature?.type;
                if (key && value) {
                    html.text(`{[${key[0].name}]}:`);
                    this.generateType(html, value, data, scope);
                    html.text('}');
                }
            } else if (t.declaration?.children) {
                html.text('{');
                let first = true;
                for (const child of t.declaration.children) {
                    if (!first) {
                        html.text(', ');
                    }
                    first = false;

                    html.text(`${child.name}: `);
                    this.generateType(html, child.type, data, scope);
                }
                html.text('}');
            } else if (t.declaration?.signatures?.[0]) {
                const sig = t.declaration.signatures[0];
                this.generateSignature(html, sig, data, scope);
                html.text(' => ');
                if (sig.type) {
                    this.generateType(html, sig.type, data, scope);
                }
            }
        } else if (t.type === 'literal') {
            html.text(`'${t.value}'`);
        } else {
            if (data && link === true) {
                this.generateLink(html, data, scope, t.id, t.name || '');
            } else if (typeof link === 'string') {
                html.link(`#${link}`, t.name ?? '');
            } else {
                html.text(t.name ?? '');
            }
        }

        if (t.typeArguments && t.typeArguments.length > 0) {
            html.text('<');
            let first = true;
            for (const arg of t.typeArguments) {
                if (!first) {
                    html.text(', ');
                }
                first = false;
                this.generateType(html, arg, data, scope);
            }
            html.text('>');
        }
    }

    protected generateSignature(html: Html, sig: ITsDocNode, data: TsDocData | undefined, scope: ITsDocNode | undefined) {
        if (!sig.parameters || sig.parameters.length === 0) {
            html.text(`()`);
        } else {
            html.text(`( `);
            let first = true;
            for (const p of sig.parameters) {
                if (!first) {
                    html.text(', ');
                }
                first = false;

                const optional = p.flags?.isOptional ? '?' : '';
                html.text(`${p.name}${optional}: `);
                if (p.type) {
                    this.generateType(html, p.type, data, scope);
                }
            }
            html.text(' )');
        }
    }

    protected generateComment(html: Html, node: ITsDocNode, data: TsDocData | undefined, short = true) {
        let comment = (node as ITsDocNode).comment ?? (node as ITsDocNode).type?.declaration?.signatures?.[0]?.comment;
        let summary: ISummaryItem[] | undefined = comment?.summary ?? [];

        if (!comment) {
            const n = (node as ITsDocNode).children?.find((x) => x.name === 'index');
            if (n) {
                comment = n.comment ?? n.type?.declaration?.signatures?.[0]?.comment;
                summary = comment?.summary;
            }
        }

        if (summary) {
            this.generateSummary(html, node, data, summary, short);
        }

        if (short) {
            return;
        }

        if ((node as ITsDocNode)?.parameters) {
            const params = (node as ITsDocNode).parameters?.filter((x) => !!x.comment);
            if ((params?.length ?? 0) > 0) {
                html.tag('h4', undefined, 'Parameters');
                html.start('div', 'details');
                html.start('ul', 'parameters');
                for (const p of params ?? []) {
                    html.start('li');

                    const optional = p.flags?.isOptional ? '?' : '';
                    html.text(`${p.name}${optional}`);

                    //if (p.type) {
                    //    this.generateType(html, p.type, data);
                    //}

                    this.generateComment(html, p, data, false);

                    html.end(); // li
                }
                html.end(); // ul
                html.end(); // details
            }
        }

        for (const blockKey of BLOCK_KEYS) {
            const tags = comment?.blockTags?.filter((x) => x.tag === '@' + blockKey) || [];
            for (const tag of tags) {
                html.tag('h4', undefined, blockKey);
                html.start('div', 'details');
                this.generateSummary(html, node, data, tag.content ?? [], false);
                html.end();
            }
        }
    }

    protected generateSummary(html: Html, scope: ITsDocNode, data: TsDocData | undefined, items: ISummaryItem[], short = true) {
        const marker = 'xxxkdjfjjrijfzdkvnkcxxx';
        const parts: string[] = [];
        const actions: Array<() => void> = [];
        for (const item of items) {
            if (item.kind === 'inline-tag') {
                parts.push(marker);
                const textParts = (item.text?.split('|') ?? []).map((x) => x.trim());
                actions.push(() => {
                    this.generateLink(html, data, scope, item.target ?? -1, textParts[0] || '', textParts[1]);
                });
            } else if (item.kind === 'code') {
                parts.push(item.text || '');
            } else {
                let text = item.text ?? '';
                if (short) {
                    text = replaceAll(text, '\r', '');
                    const idx = text.indexOf('\n\n');
                    if (idx >= 0) {
                        text = text.substring(0, idx);
                        parts.push(text);
                        break;
                    }
                }
                parts.push(text);
            }
        }
        const md = parts.join('');
        marked.marked.setOptions({
            highlight: function (code, lang, callback) {
                const highlighted = highlight.default.highlight(lang, code);
                callback?.(undefined, highlighted.value);
                return highlighted.value;
            }
        });

        html.start('div', 'comment');
        const htmlText = marked.marked.parse(md);
        const htmlParts = htmlText.split(marker);
        for (let idx = 0; idx < htmlParts.length; idx++) {
            html.raw(htmlParts[idx]);
            actions[idx]?.();
        }
        html.end();
    }

    protected generateNavigator(html: Html, scope: ITsDocNode) {
        html.start('div', 'navigator');
        // html.link('index.html', 'Home');
        this.generateBreadCrumb(html, scope);
        html.end();
    }

    protected generateBreadCrumb(html: Html, scope: ITsDocNode) {
        if (scope.parent) {
            const parts = getCanonicalParts(scope.parent);
            html.start('div', 'breadcrumb');
            let first = true;
            for (const part of parts) {
                if (part.name !== '') {
                    if (!first) {
                        html.tag('span', 'chevron', ' > ');
                    }
                    if (first) {
                        console.log('FIRST', part.name, scope.name);
                    }
                    this.generateLink(html, scope.data, scope, -1, part.name, undefined);
                    first = false;
                }
            }
            html.end(); // breadcrumb
        }
    }
}
