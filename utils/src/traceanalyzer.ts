import * as fs from 'fs';
import { IEnterStruct, IEventStruct, ILeaveStruct, ILogStruct } from './tracetofile';

interface INode {
    uid: string;
    enter?: IEnterStruct;
    leave?: ILeaveStruct;
    log?: ILogStruct;
    duration?: number;
    parent?: INode;
    children: INode[];
    application?: string;
}

interface IScanItem {
    level: number;
    node: INode;
}

export class TraceAnalyzer {
    protected events: IEventStruct[];
    protected nodes: Map<string, INode>;
    protected roots: INode[];
    protected cids: Map<string, INode>;
    protected epoch?: number;
    protected epochExact?: number;

    constructor(events: IEventStruct[], epoch?: number, epochExact?: number) {
        this.events = events;
        this.epoch = epoch;
        this.epochExact = epochExact;
        this.nodes = new Map();
        this.cids = new Map();
        this.roots = [];
        this.treeify();
    }

    public treeify() {
        for (const event of this.events) {
            if (event.level === 'enter') {
                const enter = event as IEnterStruct;
                let node = this.nodes.get(enter.uid);
                if (!node) {
                    node = {
                        uid: enter.uid,
                        application: enter.application,
                        children: []
                    };
                    this.nodes.set(enter.uid, node);
                }
                node.enter = enter;
            } else if (event.level === 'leave') {
                const leave = event as ILeaveStruct;
                let node = this.nodes.get(leave.uid);
                if (!node) {
                    node = {
                        uid: leave.uid,
                        application: leave.application,
                        children: []
                    };
                    this.nodes.set(leave.uid, node);
                }
                node.leave = leave;
                node.duration = leave?.duration;
            } else {
                const log = event as ILogStruct;
                const node: INode = {
                    uid: log.uid,
                    application: log.application,
                    children: []
                };
                node.log = log;
                this.nodes.set(log.uid, node);
            }
        }

        for (const node of this.nodes.values()) {
            const parentUid = node?.enter?.parentUid ?? node?.leave?.parentUid ?? node?.log?.parentUid;
            if (parentUid) {
                node.parent = this.nodes.get(parentUid);
            }
            if (node.parent) {
                node.parent.children.push(node);
            } else {
                this.roots.push(node);
            }

            const cids = node.enter?.cids ?? node.leave?.cids ?? node.log?.cids ?? [];
            for (const cid of cids) {
                const current = this.cids.get(cid);
                if (current) {
                    if (sortNodes(current, node) > 0) {
                        this.cids.set(cid, node);
                    }
                } else {
                    this.cids.set(cid, node);
                }
            }
        }

        for (const node of this.nodes.values()) {
            node.children.sort(sortNodes);
        }

        this.roots.sort(sortNodes);
    }

    public dumpRoots(app?: string) {
        let n = 0;
        for (const root of this.roots) {
            if (app === undefined || root.application === app) {
                console.log(
                    `${root.uid.substring(0, 8)} ${(root.leave?.duration?.toFixed(2) ?? '-').padStart(
                        8,
                        ' '
                    )}ms ${root.application?.padEnd(20)} ${this.extractSectionName(root)}`
                );
                n++;
                if (n > 1000) {
                    console.log(`(and ${this.roots.length - n} more root events`);
                    break;
                }
            }
        }
    }

    public dumpCids(app: string | undefined, epoch: number | undefined) {
        let n = 0;
        for (const [cid, node] of Array.from(this.cids.entries()).sort((a, b) => sortNodes(a[1], b[1]))) {
            if (node) {
                if (app === undefined || node?.application === app) {
                    const moment = node.enter?.moment ?? node.leave?.moment ?? node.log?.moment ?? 0;
                    let time = '';
                    if (epoch === undefined) {
                        const date = new Date(moment);
                        time = `${date.getHours().toString()}:${date.getMinutes().toString().padStart(2, '0')}:${date
                            .getSeconds()
                            .toString()
                            .padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
                    } else {
                        time = (moment - epoch).toFixed(2).padStart(10, ' ');
                    }

                    console.log(
                        `${cid.substring(0, 8)} ${(node.leave?.duration?.toFixed(2) ?? '-').padStart(8, ' ')}ms ${time.padStart(
                            10
                        )} ${node.application?.padEnd(20)} ${this.extractSectionName(node)}`
                    );
                    n++;
                    if (n > 1000) {
                        console.log(`(and ${this.cids.size - n} more cid's`);
                        break;
                    }
                }
            }
        }
    }

    public dumpTree1(node: INode, indent: string, epoch?: number) {
        let time = '';
        const moment = node.enter?.moment ?? node.leave?.moment ?? node.log?.moment ?? 0;
        if (epoch === undefined) {
            const date = new Date(moment);
            time = `${date.getHours().toString()}:${date.getMinutes().toString().padStart(2, '0')}:${date
                .getSeconds()
                .toString()
                .padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
        } else {
            time = (moment - epoch).toFixed(2).padStart(10, ' ');
        }

        console.log(
            `${node.uid.substring(0, 8)} ${(node.leave?.duration?.toFixed(2) ?? '-').padStart(
                8,
                ' '
            )}ms ${time} ${node.application?.padEnd(15)} ${indent} ${this.extractSectionName(node)}`
        );
        if (node.children.length > 0) {
            for (const child of node.children) {
                this.dumpTreeOld(child, epoch);
            }
        }
    }

    public dumpTreeOld(root: INode, epoch?: number) {
        const items: IScanItem[] = [];
        this.scanTree(root, 0, items);
        items.sort(sortScanItems);
        const appsSet = new Set<string>();
        for (const item of items) {
            if (item.node.application) {
                appsSet.add(item.node.application);
            }
        }
        const apps = Array.from(appsSet.keys()).sort();

        for (const item of items) {
            const node = item.node;
            let time = '';
            const moment = node.enter?.moment ?? node.leave?.moment ?? node.log?.moment ?? 0;
            if (epoch === undefined) {
                const date = new Date(moment);
                time = `${date.getHours().toString()}:${date.getMinutes().toString().padStart(2, '0')}:${date
                    .getSeconds()
                    .toString()
                    .padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
            } else {
                time = (moment - epoch).toFixed(2).padStart(10, ' ');
            }

            const appIdx = apps.indexOf(item.node.application || '');
            const appIndent = ''.padStart(appIdx * 40, '.');
            const levelIndent = ''.padStart(item.level * 2, ' ');

            const branches = this.analyzeBranch(node);
            const branchInfo = branches.length > 0 ? ` See branch(es) ${branches.map((x) => x.substring(0, 8)).join(', ')}` : '';

            console.log(
                `${node.uid.substring(0, 8)} ${(node.leave?.duration?.toFixed(2) ?? '-').padStart(
                    8,
                    ' '
                )}ms ${time} ${node.application?.padEnd(15)} ${appIndent} | ${levelIndent} ${this.extractSectionName(
                    node
                )}${branchInfo}`
            );
        }
    }

    public dumpTree() {
        const appsSet = new Set<string>();
        for (const node of this.nodes.values()) {
            if (node.application) {
                appsSet.add(node.application);
            }
        }
        const apps = Array.from(appsSet.keys()).sort();

        const sortedNodes = Array.from(this.nodes.values()).sort(sortNodes);

        const epoch = this.epoch;
        const epochExact = this.epochExact;

        for (const node of sortedNodes) {
            const level = this.determineLevel(node);
            let time = '';
            const moment = node.enter?.moment ?? node.leave?.moment ?? node.log?.moment ?? 0;
            if (epoch === undefined) {
                const date = new Date(moment);
                time = `${date.getHours().toString()}:${date.getMinutes().toString().padStart(2, '0')}:${date
                    .getSeconds()
                    .toString()
                    .padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
            } else {
                time = (moment - epoch).toFixed(2).padStart(10, ' ');
            }

            let momentExact = node.enter?.momentExact ?? node.leave?.momentExact ?? node.log?.momentExact ?? 0;
            if (epochExact) {
                momentExact -= epochExact;
            }

            const appIdx = apps.indexOf(node.application || '');
            const appIndent = ''.padStart(appIdx * 40, '.');
            const levelIndent = ''.padStart(level * 2, ' ');

            const branches = this.analyzeBranch(node);
            const branchInfo = branches.length > 0 ? ` See branch(es) ${branches.map((x) => x.substring(0, 8)).join(', ')}` : '';

            console.log(
                `${node.uid.substring(0, 8)} ${(node.leave?.duration?.toFixed(2) ?? '-').padStart(8, ' ')}ms ${time} ${momentExact
                    .toFixed(2)
                    .padStart(7, ' ')} ${node.application?.padEnd(15)} ${appIndent} | ${levelIndent} ${this.extractSectionName(
                    node
                )}${branchInfo}`
            );
        }
    }

    public scanTree(node: INode, level: number, items: IScanItem[]) {
        items.push({
            level,
            node
        });
        if (node.children.length > 0) {
            for (const child of node.children) {
                this.scanTree(child, level + 1, items);
            }
        }
    }

    public findRoot(prefix: string): INode {
        const root = this.roots.find((x) => x.uid.startsWith(prefix));
        if (!root) {
            throw new Error(`No root not starting with [${prefix}]`);
        }
        return root;
    }

    protected analyzeBranch(node: INode) {
        const result: string[] = [];
        if (node.parent) {
            const cids = node.enter?.cids ?? [];
            const pcids = node.parent.enter?.cids ?? [];
            for (const cid of cids ?? []) {
                if (!pcids.includes(cid)) {
                    result.push(cid);
                }
            }
        }
        return result;
    }

    protected extractSectionName(node: INode) {
        const ex = node.leave?.exception ? ' with exception ' + node.leave?.exception : '';
        if (node.enter) {
            return `[${cleanScope(node.enter.scope)}] ${node.enter.id ?? ''}${ex}`;
        } else if (node.leave) {
            return `[${cleanScope(node.leave.scope)}] ${node.leave.id ?? ''}`;
        } else if (node.log) {
            return `${node.log.level.toUpperCase().padEnd(7)} ${node.log.message}`;
        }
        return '';
    }

    protected determineLevel(node: INode) {
        let n: INode | undefined = node;
        let level = 0;
        while (n) {
            n = n.parent;
            level++;
        }
        return level;
    }
}

function cleanScope(scope?: string) {
    if (scope === undefined) {
        return '';
    }
    const parts = scope.split('.');
    const namespace = parts.slice(0, -1).join('.');
    return `${parts[parts.length - 1]} (${namespace})`;
}

function sortNodes(a: INode, b: INode) {
    // the 'moments' have less resolution, but are consistent across servers (provided that their time is synchronized).
    // The 'exact moments' have more resolution, but are not comparable between servers.
    // We first compare on 'moment'. Only when they are the same, we use the 'exact moment' which does no harm when
    // it is about events from different servers, but gives us the right order when they are from the same server.
    const ma = a.enter?.moment ?? a.leave?.moment ?? a.log?.moment ?? 0;
    const mb = b.enter?.moment ?? b.leave?.moment ?? b.log?.moment ?? 0;
    if (ma === mb) {
        const mma = a.enter?.momentExact ?? a.leave?.momentExact ?? a.log?.momentExact ?? 0;
        const mmb = b.enter?.momentExact ?? b.leave?.momentExact ?? b.log?.momentExact ?? 0;
        return mma - mmb;
    } else {
        return ma - mb;
    }
}

function sortScanItems(a: IScanItem, b: IScanItem) {
    const result = sortNodes(a.node, b.node);
    if (result === 0) {
        return a.level - b.level;
    }
    return result;
}

export function loadEventFiles(
    cid?: string
): [epoch: number | undefined, epochExact: number | undefined, events: IEventStruct[]] {
    const items: IEventStruct[] = [];
    let epoch: number | undefined;
    let epochExact: number | undefined;

    const path = './trace/';
    const files = fs.readdirSync(path);
    for (const file of files) {
        if (file.endsWith('json.txt')) {
            try {
                if (cid && !file.startsWith(cid)) {
                    continue;
                }

                const raw = fs.readFileSync(path + file, { encoding: 'utf-8' });
                const lines = raw.split('\n');

                let uid: string | undefined;

                for (const line of lines) {
                    try {
                        const struct = JSON.parse(line) as IEventStruct;

                        if (uid !== undefined && uid !== struct.uid) {
                            continue;
                        }

                        if (struct.moment) {
                            if (epoch === undefined || struct.moment < epoch) {
                                epoch = struct.moment;
                            }
                        }

                        if (struct.momentExact) {
                            if (epochExact === undefined || struct.momentExact < epochExact) {
                                epochExact = struct.momentExact;
                            }
                        }

                        if (cid) {
                            for (const c of struct.cids ?? []) {
                                if (c.startsWith(cid)) {
                                    items.push(struct);
                                    break;
                                }
                            }
                        } else {
                            items.push(struct);
                        }

                        if (!cid) {
                            uid = struct.uid;
                        }
                    } catch (e) {
                        console.log('Ignoring line', line, e);
                    }
                }
            } catch (e) {
                console.log('Ignoring file', file, e);
            }
        }
    }
    return [epoch, epochExact, items];
}

if (require.main === module) {
    const app = findArg('app');
    const cid = findArg('cid');

    const [epoch, epochExact, events] = loadEventFiles(cid);
    const analyzer = new TraceAnalyzer(events, epoch, epochExact);

    if (app) {
        analyzer.dumpCids(app, epoch);
    } else if (cid) {
        analyzer.dumpTree();
    } else {
        analyzer.dumpCids(undefined, epoch);
    }
}

function findArg(name: string): string | undefined {
    const idx = process.argv.indexOf('--' + name);
    if (idx >= 0) {
        return process.argv[idx + 1];
    }
}
