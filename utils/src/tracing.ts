import { replaceArguments } from './formatting';
import { wildcardMatch } from './util';
import * as ev from 'events';
import * as uuid from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';
import { performance } from 'perf_hooks';

export type TTraceLevel = 'error' | 'warning' | 'info' | 'verbose' | 'debug' | 'deep';

export const DO_NOT_TRACE: TTraceLevel[] = [];
export const TRACE_ERROR_AND_UP: TTraceLevel[] = ['error'];
export const TRACE_WARNING_AND_UP: TTraceLevel[] = ['error', 'warning'];
export const TRACE_INFO_AND_UP: TTraceLevel[] = ['error', 'warning', 'info'];
export const TRACE_VERBOSE_AND_UP: TTraceLevel[] = ['error', 'warning', 'info', 'verbose'];
export const TRACE_DEBUG_AND_UP: TTraceLevel[] = ['error', 'warning', 'info', 'verbose', 'debug'];
export const TRACE_DEEP_AND_UP: TTraceLevel[] = ['error', 'warning', 'info', 'verbose', 'debug', 'deep'];

export type TraceAtts = () => { [key: string]: unknown };

export interface ITraceInfo {
    correlationIds: string[];
    parentSegmentId?: string;
}

export interface IScope {
    log(level: string, msg: string, args?: () => { [key: string]: unknown }): void;
    error(msg: string, args?: () => { [key: string]: unknown }): void;
    warning(msg: string, args?: () => { [key: string]: unknown }): void;
    info(msg: string, args?: () => { [key: string]: unknown }): void;
    verbose(msg: string, args?: () => { [key: string]: unknown }): void;
    debug(msg: string, args?: () => { [key: string]: unknown }): void;
    deep(msg: string, args?: () => { [key: string]: unknown }): void;

    newChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope;
    branch(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope;
    finish(): void;
    perform<Result>(func: () => Result): Promise<Result>;

    getUid(): string;
    getCorrelationIds(): string[] | undefined;
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

    public newChildScope(_scope: string, _id?: string | string[], _traceAtts?: TraceAtts, _tracing?: ITraceInfo): IScope {
        return new EmptyScope();
    }

    public branch(_scope: string, _id?: string | string[], _traceAtts?: TraceAtts, _tracing?: ITraceInfo): IScope {
        return new EmptyScope();
    }
    
    public finish(): void {
        //
    }

    public async perform<Result>(func: () => Result): Promise<Result> {
        return await func();
    }

    public getUid(): string {
        return '';
    }

    public getCorrelationIds(): string[] | undefined {
        return undefined;
    }
}

interface IMask {
    mask: string;
    levels: string[];
}

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

export function deeper(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope {
    return currentScope().newChildScope(scope, id, traceAtts, tracing);
}

export interface ILogEvent {
    scope: Scope;
    level: TTraceLevel | string;
    msg: string;
    args?: () => { [key: string]: unknown };
    tags?: () => { [key: string]: unknown };
}

export declare interface Tracer {
    on(event: 'rawLog', listener: (event: ILogEvent) => void): this;
    on(event: 'filteredLog', listener: (event: ILogEvent) => void): this;
    on(event: 'enter', listener: (scope: Scope) => void): this;
    on(event: 'exit', listener: (scope: Scope) => void): this;
}

export interface ITraceMetric {
    scope: string;
    count: number;
    totalTime: number;
}

export interface ITraceFilter {
    scope?: string;
    id?: string;
    interval?: number;
}

export class Tracer extends ev.EventEmitter {
    public masks?: IMask[];
    public levels?: string[];
    protected _root: Scope;
    protected autoTracers?: ITraceFilter[];

    constructor(scope?: string, id?: string | string[], masks?: IMask[], autoTracers?: ITraceFilter[]) {
        super();
        this.masks = [];
        this.levels = [];
        if (masks) {
            this.replaceMasks(masks);
        }
        this.autoTracers = autoTracers;
        this._root = new Scope(this, undefined, scope, id);
        _ROOT_SCOPE = this._root;
    }

    public finish(): void {
        this._root.finish();
    }

    public root(): IScope {
        return this._root;
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

    public newChildScope(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope {
        return new Scope(this, this._root, scope, id, traceAtts, tracing);
    }

    public doTrace(scope: string | undefined, id: string | string[] | undefined): boolean {
        if (this.autoTracers) {
            const id2 = typeof id === 'string' ? id : id?.join(':') ?? '';
            for (const filter of this.autoTracers) {
                if (filter.scope) {
                    if (!(scope ?? '').startsWith(filter.scope)) {
                        continue;
                    }
                }
                if (filter.id) {
                    if (!(id2.startsWith(filter.id))) {
                        continue;
                    }
                }

                if (filter.interval ?? 0 > 1) {
                    const r = Math.random() * (filter.interval ?? 1);
                    if (r > 1) {
                        continue;
                    }
                }

                return true;
            }
        }
        return false;
    }
}

export class Scope implements IScope {
    public readonly parent?: Scope;
    public readonly scope?: string;
    public readonly id?: string | string[];
    public readonly start?: number;
    public readonly startExact?: number;
    public readonly traceInfo?: ITraceInfo;
    public readonly traceAtts: TraceAtts | undefined;
    public root: Tracer;
    protected tags?: { [key: string]: unknown };
    protected uid?: string;
    protected exception?: unknown;
    protected subTraceInfo?: ITraceInfo;
    
    constructor(
        root: Tracer,
        parent: Scope | undefined,
        scope?: string,
        id?: string | string[],
        traceAtts?: TraceAtts,
        traceInfo?: ITraceInfo,
        subTraceInfo?: ITraceInfo
    ) {
        this.parent = parent;
        this.root = root;
        this.scope = scope;
        this.id = id;
        this.traceInfo = traceInfo;
        this.subTraceInfo = subTraceInfo;
        this.traceAtts = traceAtts;

        if (root.doTrace(scope, id)) {
            if (this.traceInfo) {
                if (this.traceInfo.correlationIds) {
                    this.traceInfo.correlationIds.push(uuid.v4());
                } else {
                    this.traceInfo.correlationIds = [uuid.v4()];
                }
            } else {
                this.traceInfo = {
                    correlationIds: [uuid.v4()],
                    parentSegmentId: this.getParentUid()
                }
            }
        }

        if (this.traceInfo) {
            this.start = Date.now();
            this.startExact = performance.now();
            root.emit('enter', this);
        }
    }

    public finish(): void {
        if (this.traceInfo) {
            this.root.emit('exit', this);
        }
    }

    public async perform<Result>(func: () => Result): Promise<Result> {
        try {
            return await _CURRENT_SCOPE.run(this, func);
        } catch (e) {
            this.exception = e;
            throw e;
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

    public log(level: TTraceLevel | string, msg: string, args?: () => { [key: string]: unknown }): void {
        if (!(this.subTraceInfo || this.traceInfo)) {
            return;
        }

        this.root.emit('rawLog', {
            scope: this,
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
        
        this.root.emit('filteredLog', {
            scope: this,
            level,
            msg,
            args,
            tags: () => this.getTags()
        });
    
        console.log(`${time} [${scope}] ${level.toUpperCase()} ${replaceArguments(msg, args?.())}`);
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
        const traceinfobase = tracing ?? this.subTraceInfo ?? this.traceInfo;
        const traceinfo: ITraceInfo | undefined = traceinfobase ? {
            correlationIds: traceinfobase.correlationIds,
            parentSegmentId: tracing?.parentSegmentId ?? this.getUid()
        } : undefined;
        return new Scope(
            this.root,
            this,
            scope,
            id,
            traceAtts,
            traceinfo
        );
    }

    public branch(scope: string, id?: string | string[], traceAtts?: TraceAtts, tracing?: ITraceInfo): IScope {
        if (!(tracing || this.traceInfo)) {
            return this.newChildScope(scope, id, traceAtts, tracing);
        }

        const subtracing: ITraceInfo | undefined = tracing ?? this.traceInfo ? {
            correlationIds: [uuid.v4()]
        } : undefined;
        const scopeTracing: ITraceInfo | undefined = this.traceInfo ? {
            correlationIds: [...this.traceInfo.correlationIds, ...subtracing?.correlationIds ?? []],
            parentSegmentId: this.getUid()
        } : undefined;
        return new Scope(
            this.root,
            this,
            scope,
            id,
            traceAtts,
            scopeTracing,
            subtracing
        );
    }

    public getUid(): string {
        if (!this.uid) {
            const uid = uuid.v4();
            this.uid = uid;
            return uid;
        }
        return this.uid;
    }

    public getParentUid(): string | undefined {
        if (this.traceInfo?.parentSegmentId) {
            return this.traceInfo.parentSegmentId;
        }
        if (this.parent) {
            return this.parent.getUid();
        }
        return undefined;
    }

    public getCorrelationIds(): string[] | undefined {
        return this.traceInfo?.correlationIds;
    }

    public getException(): unknown {
        return this.exception;
    }


    public findScopeId(scope: string): string | string[] | undefined {
        if (this.scope === scope) {
            return this.id;
        }
        if (this.parent) {
            return this.parent.findScopeId(scope);
        }
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
