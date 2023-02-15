import { onApplicationStop } from './util';
import * as fs from 'fs';
import * as pathlib from 'path';
import * as uuid from 'uuid';
import { Tracer } from './tracing';
import { replaceArguments } from './formatting';
import { performance } from 'perf_hooks';

const fillers: string[] = ['     ', '    ', '   ', '  ', ' '];

export interface IEventStruct {
    uid: string;
    level: string;
    message: string;
    moment?: number;
    momentExact?: number;
    application?: string;
    cids?: string[];
    _: string;
}

export interface IEnterStruct extends IEventStruct {
    scope?: string;
    id?: string;
    parentUid?: string;
}

export interface ILeaveStruct extends IEventStruct {
    scope?: string;
    id?: string;
    duration?: number;
    parentUid?: string;
    exception?: string;
}

export interface ILogStruct extends IEventStruct {
    args?: { [key: string]: unknown };
    parentUid?: string;
}

export class FileTracer {
    protected items: Map<string, string[]>;
    protected uid: string;
    protected tracer: Tracer;
    protected application: string;
    protected path: string;

    constructor(tracer: Tracer, application: string, path?: string) {
        this.tracer = tracer;
        this.application = application;
        this.items = new Map();
        this.uid = uuid.v4();
        this.path = path ?? './trace';

        tracer.on('enter', (event) => {
            const struct: IEnterStruct = {
                level: 'enter',
                _: '',
                message: `Entering [${[event.scope, event.id].join(':')}]`,
                scope: event.scope,
                id: typeof event.id === 'string' ? event.id : event.id?.join(':'),
                moment: event.start,
                momentExact: event.startExact,
                uid: event.getUid(),
                parentUid: event.getParentUid(),
                cids: event.getCorrelationIds(),
                application: this.application
            };
            this.pushItem(struct);
        });

        tracer.on('exit', (event) => {
            let duration: number | undefined;
            const now = performance.now();
            if (event.duration) {
                duration = event.duration;
            } else if (event.startExact) {
                duration = now - event.startExact;
            }
            const struct: ILeaveStruct = {
                level: 'leave',
                _: '',
                message: `Leaving [${[event.scope, event.id].join(':')}] after [${duration}] ms`,
                scope: event.scope,
                id: typeof event.id === 'string' ? event.id : event.id?.join(':'),
                moment: Date.now(),
                momentExact: now,
                duration,
                uid: event.getUid(),
                parentUid: event.getParentUid(),
                cids: event.getCorrelationIds(),
                application: this.application,
                exception: event.getException()?.toString()
            };
            this.pushItem(struct);
        });

        tracer.on('rawLog', (event) => {
            const args = event.args?.();
            const now = performance.now();
            const struct: ILogStruct = {
                level: event.level,
                _: fillers[event.level.length] ?? '',
                message: replaceArguments(event.msg, args),
                moment: Date.now(),
                momentExact: now,
                uid: uuid.v4(),
                parentUid: event.scope.getUid(),
                cids: event.scope.getCorrelationIds(),
                application: this.application
            };
            this.pushItem(struct);
        });

        onApplicationStop(() => {
            this.dump();
        });
    }

    public dump() {
        for (const [cid, c] of this.items.entries()) {
            const fullName = [this.path, `${cid}.${this.uid}.json.txt`].join('/');
            const p = pathlib.dirname(fullName);
            fs.mkdirSync(p, { recursive: true });
            const contents = c.join('\n');
            fs.writeFileSync(fullName, contents);
        }
    }

    protected pushItem(struct: IEventStruct) {
        const str = JSON.stringify(struct);
        for (const cid of struct.cids ?? []) {
            let c = this.items.get(cid);
            if (!c) {
                c = [];
                this.items.set(cid, c);
            }
            c.push(str);
        }
    }
}
