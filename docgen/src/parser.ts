export interface ITsDocNode {
    id: number;
    name: string;
    kind: number;
    kindString: string;
    children?: ITsDocNode[];
    groups?: Array<{ title: string; children: number[] }>;
    parent?: ITsDocNode;
    signatures?: ITsDocNode[];
    type?: ITsDocType;
    parameters?: ITsDocNode[];
    flags?: {
        isProtected?: boolean;
        isPrivate?: boolean;
        isOptional?: boolean;
    };
    comment?: ITsDocComment;
    indexSignature?: ITsDocNode; // for a dictionary: has parameters (the key) and type (the value)
    typeParameters?: ITsDocType[]; // Generics types
    data?: TsDocData;
}

export interface ITsDocComment {
    summary?: ISummaryItem[];
}

export interface ISummaryItem {
    kind: 'text' | 'code' | 'inline-tag';
    text?: string;
    tag?: string;
    target?: number;
}

export interface ITsDocType {
    id: number;
    type: 'reference' | 'array' | 'intrinsic' | 'union' | 'reflection';
    types?: ITsDocType[]; // In case of union
    name?: string; // In case of intrinsic (built-in type) or reference
    elementType?: ITsDocType; // In case of array
    typeArguments?: ITsDocType[]; // Generics types
    declaration?: ITsDocNode;
}

export interface ITsDocKind {
    name: string;
    nodes: ITsDocNode[];
}

export class TsDocData {
    protected nodes: Map<number, ITsDocNode>;
    protected nodesByName: Map<string, number>;
    protected nodesByKind: Map<string, ITsDocKind>;

    constructor() {
        this.nodes = new Map();
        this.nodesByName = new Map();
        this.nodesByKind = new Map();
    }

    public addNode(node: ITsDocNode, parent: ITsDocNode | undefined) {
        node.parent = parent;
        node.data = this;
        this.nodes.set(node.id, node);
        const scoped = parent?.kindString === 'Class' || parent?.kindString === 'Interface';
        const name = scoped ? [node.kindString, parent?.name, node.name].join(' ') : [node.kindString, node.name].join(' ');
        this.nodesByName.set(name, node.id);
        if (node.kindString !== 'Reference') {
            this.nodesByName.set(node.name, node.id);
        }
        let k = this.nodesByKind.get(node.kindString);
        if (!k) {
            k = {
                name: node.kindString,
                nodes: []
            };
            this.nodesByKind.set(node.kindString, k);
        }
        k.nodes.push(node);
    }

    public tryById(id: number): ITsDocNode | undefined {
        return this.nodes.get(id);
    }

    public byId(id: number): ITsDocNode {
        const item = this.nodes.get(id);
        if (!item) {
            throw new Error('Item not found');
        }
        return item;
    }

    public tryByName(name: string): ITsDocNode | undefined {
        const id = this.nodesByName.get(name);
        if (id === undefined) {
            return;
        }
        const item = this.nodes.get(id);
        if (!item) {
            throw new Error('Item not found');
        }
        return item;
    }

    public byName(name: string): ITsDocNode {
        const id = this.nodesByName.get(name);
        if (id === undefined) {
            throw new Error(`No such doc item: ${name}`);
        }
        const item = this.nodes.get(id);
        if (!item) {
            throw new Error('Item not found');
        }
        return item;
    }

    public byKind(name: string): ITsDocNode[] {
        const kind = this.nodesByKind.get(name);
        if (kind) {
            return kind.nodes;
        }
        return [];
    }

    public getKindNames(): string[] {
        return Array.from(this.nodesByKind.keys());
    }
}

export class TsdocParser {
    public parse(tsdoc: ITsDocNode): TsDocData {
        const data = new TsDocData();

        this.parseImpl(data, tsdoc, undefined);

        return data;
    }

    protected parseImpl(data: TsDocData, node: ITsDocNode, parent: ITsDocNode | undefined) {
        data.addNode(node, parent);

        if (node.children) {
            for (const child of node.children) {
                this.parseImpl(data, child, node);
            }
        }
    }
}
