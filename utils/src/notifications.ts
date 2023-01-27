import { replaceArguments } from './formatting';
import * as ev from 'events';

// Definition of trace levels:
// - Error: for bugs in the software. Things that should not happen.
// - Warning: for situations someone should investigate
// - Info: High level information, typically for events that do not happen a lot (like starting up or stopping)
// - Verbose: Medium evel information, typically for events that happen quite often (like performing one action)
// - Debug: Additional details under verbose
// - Deep: Insane log level with all the gory details.

export type TNotificationLevel = 'error' | 'warning' | 'info' | 'verbose' | 'debug' | 'deep';

export const DO_NOT_NOTIFY: TNotificationLevel[] = [];
export const NOTIFY_ERROR_AND_UP: TNotificationLevel[] = ['error'];
export const NOTIFY_WARNING_AND_UP: TNotificationLevel[] = ['error', 'warning'];
export const NOTIFY_INFO_AND_UP: TNotificationLevel[] = ['error', 'warning', 'info'];
export const NOTIFY_VERBOSE_AND_UP: TNotificationLevel[] = ['error', 'warning', 'info', 'verbose'];
export const NOTIFY_DEBUG_AND_UP: TNotificationLevel[] = ['error', 'warning', 'info', 'verbose', 'debug'];
export const NOTIFY_DEEP_AND_UP: TNotificationLevel[] = ['error', 'warning', 'info', 'verbose', 'debug', 'deep'];

export interface INotifier {
    notify(level: string, id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    error(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    warning(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    info(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    verbose(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    debug(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
    deep(id: string, msg: string, args?: () => { [key: string]: unknown }): void;
}

export class EmptyNotifier implements INotifier {
    public notify(_level: string, _id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public error(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public warning(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public info(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public verbose(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public debug(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }

    public deep(_id: string, _msg: string, _args?: () => { [key: string]: unknown }): void {
        //
    }
}

export interface INotifyEvent {
    level: TNotificationLevel | string;
    msg: string;
    args?: () => { [key: string]: unknown };
    tags?: () => { [key: string]: unknown };
}

export declare interface Notifier {
    on(event: 'log', listener: (event: INotifyEvent) => void): this;
}

export class Notifier extends ev.EventEmitter implements INotifier {
    public levels?: string[];
    
    constructor(levels: string[]) {
        super();
        this.levels = levels;
    }

    public notify(level: TNotificationLevel | string, _id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        if (this.levels?.includes(level)) {
            const now = new Date();
            const time =
                now.getHours().toString().padStart(2, '0') +
                ':' +
                now.getMinutes().toString().padStart(2, '0') +
                ':' +
                now.getSeconds().toString().padStart(2, '0') +
                '.' +
                now.getMilliseconds().toString().padEnd(3, '0').substr(0, 3);
            console.log(`${time} ${level.toUpperCase().padEnd(8)} ${replaceArguments(msg, args?.())}`);
        }
    }

    public error(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('error', id, msg, args);
    }

    public warning(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('warning', id, msg, args);
    }

    public info(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('info', id, msg, args);
    }

    public verbose(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('verbose', id, msg, args);
    }

    public debug(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('debug', id, msg, args);
    }

    public deep(id: string, msg: string, args?: () => { [key: string]: unknown }): void {
        this.notify('deep', id, msg, args);
    }
}

let _notifier: INotifier = new Notifier(NOTIFY_INFO_AND_UP);

export function setNotifier(value: INotifier) {
    _notifier = value;
}

export function notifier(): INotifier {
    return _notifier;
}
