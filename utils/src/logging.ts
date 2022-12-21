import { replaceArguments } from './formatting';
import { wildcardMatch } from './util';
import * as ev from 'events';
// import { performance } from 'perf_hooks';
import { ISegment, ITracer } from './tracing';
import { ITraceInfo } from './tracing';
import { AsyncLocalStorage } from 'async_hooks';

// Definition of log levels:
// - Error: for bugs in the software. Things that should not happen.
// - Warning: for situations someone should investigate
// - Info: High level information, typically for events that do not happen a lot (like starting up or stopping)
// - Verbose: Medium evel information, typically for events that happen quite often (like performing one action)
// - Debug: Additional details under verbose
// - Deep: Insane log level with all the gory details.

export type TLogLevel = 'error' | 'warning' | 'info' | 'verbose' | 'debug' | 'deep';

export const DO_NOT_LOG: TLogLevel[] = [];
export const ERROR_AND_UP: TLogLevel[] = ['error'];
export const WARNING_AND_UP: TLogLevel[] = ['error', 'warning'];
export const INFO_AND_UP: TLogLevel[] = ['error', 'warning', 'info'];
export const VERBOSE_AND_UP: TLogLevel[] = ['error', 'warning', 'info', 'verbose'];
export const DEBUG_AND_UP: TLogLevel[] = ['error', 'warning', 'info', 'verbose', 'debug'];
export const DEEP_AND_UP: TLogLevel[] = ['error', 'warning', 'info', 'verbose', 'debug', 'deep'];

export type TraceAtts = () => { [key: string]: unknown };

export interface IScope {
    log(level: string, msg: string, args?: () => { [key: string]: unknown }): void;
    error(msg: string, args?: () => { [key: string]: unknown }): void;
    warning(msg: string, args?: () => { [key: string]: unknown }): void;
    info(msg: string, args?: () => { [key: string]: unknown }): void;
    verbose(msg: string, args?: () => { [key: string]: unknown }): void;
    debug(msg: string, args?: () => { [key: string]: unknown }): void;
    deep(msg: string, args?: () => { [key: string]: unknown }): void;

    getSegment(): ISegment | undefined;

    newChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope;
    //enterChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope;
    finish(): void;
    //callAsync<Result>(func: () => Promise<Result>): Promise<Result>;
    perform<Result>(func: () => Result): Promise<Result>;
}

class EmptyScope implements IScope {
    public log(_level: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public error(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public warning(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public info(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public verbose(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public debug(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public deep(_msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public getSegment(): ISegment | undefined {
        return undefined;
    }

    public newChildScope(_scope: string, _id?: string | string[], _traceAtts?: TraceAtts, _tracing?: ITraceInfo): IScope {
        return new EmptyScope();
    }

    public finish(): void {
        //
    }

    public async perform<Result>(func: () => Result): Promise<Result> {
        return await func();
    }
}

interface IMask {
    mask: string;
    levels: string[];
}

let nextCid = 0;

const _CURRENT_SCOPE = new AsyncLocalStorage<IScope>();
let _ROOT_SCOPE: IScope = new EmptyScope();

export function currentScope() {
    const scope = _CURRENT_SCOPE.getStore();
    if (!scope) {
        if (!_ROOT_SCOPE) {
            throw new Error('No scope');
        }
        return _ROOT_SCOPE;
    }
    return scope;
}

export interface ILogEvent {
    level: TLogLevel | string;
    msg: string;
    args?: () => { [key: string]: unknown };
    tags?: () => { [key: string]: unknown };
}

export declare interface Logger {
    on(event: 'log', listener: (event: ILogEvent) => void): this;
}

export interface ILogMetric {
    scope: string;
    count: number;
    totalTime: number;
}

export class Logger extends ev.EventEmitter implements IScope {
    public masks?: IMask[];
    public levels?: string[];
    public tracer?: ITracer;
    protected root: Scope;

    constructor(scope?: string, id?: string | string[], masks?: IMask[], tracer?: ITracer) {
        super();
        this.masks = [];
        this.levels = [];
        if (masks) {
            this.replaceMasks(masks);
        }
        this.root = new Scope(this, undefined, scope, id);
        this.tracer = tracer;
        _ROOT_SCOPE = this.root;
    }

    public finish(): void {
        this.root.finish();
    }

    public addMask(mask: string, levels: string[]): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.masks!.push({ mask, levels });
        for (const level of levels) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (!this.levels!.includes(level)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.levels!.push(level);
            }
        }
    }

    public replaceMasks(masks: IMask[]): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.masks!.splice(0, this.masks!.length);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.levels!.splice(0, this.levels!.length);
        for (const mask of masks) {
            this.addMask(mask.mask, mask.levels);
        }
    }

    public log(level: TLogLevel | string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.root.log(level, msg, args);
    }

    public error(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('error', msg, args);
    }

    public warning(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('warning', msg, args);
    }

    public info(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('info', msg, args);
    }

    public verbose(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('verbose', msg, args);
    }

    public debug(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('debug', msg, args);
    }

    public deep(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('deep', msg, args);
    }

    public getSegment(): ISegment | undefined {
        return this.root.getSegment();
    }

    public newChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope {
        return new Scope(this, this.root, scope, id, traceAtts, tracing && this.tracer ? this.tracer.trace(tracing) : undefined);
    }

    public getRootScope(): IScope {
        return this.root;
    }

    public async perform<Result>(func: () => Result): Promise<Result> {
        try {
            return await _CURRENT_SCOPE.run(this.root, func);
        } finally {
            this.finish();
        }
    }
}

export class Scope implements IScope {
    protected parent?: Scope;
    protected scope?: string;
    protected id?: string | string[];
    protected cids?: string[];
    protected tags?: { [key: string]: unknown };
    protected start?: number;
    protected segment?: ISegment;
    public root: Logger;

    constructor(
        root: Logger,
        parent: Scope | undefined,
        scope?: string,
        id?: string | string[],
        traceAtts?: TraceAtts,
        parentSegment?: ISegment
    ) {
        this.parent = parent;
        this.root = root;
        this.scope = scope;
        this.id = id;

        if (parentSegment) {
            const attributes = { scope, id, name: id ? [scope, id].join(':') : scope, ...traceAtts?.() };
            this.segment = parentSegment.sub({
                attributes
            });
        }
    }

    public finish(): void {
        if (this.segment) {
            this.segment.finish();
        }
    }

    public async perform<Result>(func: () => Result): Promise<Result> {
        try {
            return await _CURRENT_SCOPE.run(this, func);
        } finally {
            this.finish();
        }
    }

    public addMask(mask: string, levels: string[]): void {
        this.root.addMask(mask, levels);
    }

    public replaceMasks(masks: IMask[]): void {
        this.root.replaceMasks(masks);
    }

    public log(level: TLogLevel | string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.root.emit('log', {
            level,
            msg,
            args,
            tags: () => this.getTags()
        });

        if (!this.root.levels?.includes(level)) {
            return;
        }

        const scope = this.getFullScope();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const mask of this.root.masks!) {
            if (wildcardMatch(scope, mask.mask)) {
                if (mask.levels.includes(level)) {
                    break;
                } else {
                    return;
                }
            }
        }

        const now = new Date();
        const time =
            now.getHours().toString().padStart(2, '0') +
            ':' +
            now.getMinutes().toString().padStart(2, '0') +
            ':' +
            now.getSeconds().toString().padStart(2, '0') +
            '.' +
            now.getMilliseconds().toString().padEnd(3, '0').substr(0, 3);
        const cid = this.ensureCids()
            .map((v) => 'CID:' + v)
            .join(',');
        console.log(`${time} [${scope}] ${level.toUpperCase()} ${replaceArguments(msg, args?.())} (${cid})`);
    }

    public error(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('error', msg, args);
    }

    public warning(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('warning', msg, args);
    }

    public info(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('info', msg, args);
    }

    public verbose(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('verbose', msg, args);
    }

    public debug(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('debug', msg, args);
    }

    public deep(msg: string, args?: () => { [key: string]: unknown }): void {
        this.log('deep', msg, args);
    }

    public newChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope {
        return new Scope(
            this.root,
            this,
            scope,
            id,
            traceAtts,
            tracing && this.root.tracer ? this.root.tracer.trace(tracing) : this.segment
        );
    }

    public getSegment(): ISegment | undefined {
        return this.segment;
    }

    protected ensureCids(): string[] {
        if (this.cids === undefined) {
            this.cids = (this.parent?.ensureCids() ?? []).concat([nextCid.toString().padStart(8, '0')]);
            nextCid++;
        }
        return this.cids;
    }

    protected getTags(): { [key: string]: unknown } {
        if (!this.tags) {
            const tags = this.parent ? { ...this.parent.getTags() } : {};
            if (this.scope) {
                tags[this.scope] = this.id;
            }
            this.tags = tags;
            return tags;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.tags!;
    }

    protected getFullScope(): string {
        return this.getPath()
            .map((v) => {
                const id = (Array.isArray(v.id) ? v.id.join('-') : v.id) ?? '';

                return [v.scope, id].join(':');
            })
            .filter((v) => v !== ':')
            .join(',');
    }

    protected getPath(): Scope[] {
        return (this.parent ? this.parent.getPath() : []).concat(this);
    }
}
