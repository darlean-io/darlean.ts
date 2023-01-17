import { action, IPersistable, IPersistence } from '@darlean/base';
import { sleep } from '@darlean/utils';

export async function expectError(handler: () => Promise<unknown>): Promise<Error | undefined> {
    let error;
    try {
        const result = await handler();
        console.log('EXPECT ERROR RESULT', result);
    } catch (e) {
        error = e;
        return e as Error;
    }
    expect(error).toBeDefined();
}

export class TestActor<T extends object> {
    public actor: T;
    public proxy: T;

    public preDelay?: number;
    public postDelay?: number;
    public disconnected?: boolean;

    constructor(actor: T) {
        this.actor = actor;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.proxy = new Proxy(actor, {
            get(_target, p, _receiver) {
                return async function (...args: unknown[]) {
                    return await self.handleCall(p.toString(), args);
                };
            }
        });
    }

    protected async handleCall(name: string, args: unknown): Promise<unknown> {
        if (this.disconnected) {
            throw new Error('Disconnected');
        }
        if (this.preDelay) {
            await sleep(this.preDelay);
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
            return await ((this.actor as any)[name] as Function).apply(this.actor, args);
        } finally {
            if (this.postDelay) {
                await sleep(this.postDelay);
            }
        }
    }
}

export interface IEchoActor {
    echo(value: string): Promise<string>;
    getLastValue(): Promise<string | undefined>;
}

export class EchoActor implements IEchoActor {
    protected last: IPersistable<string>;
    protected store: boolean;
    
    constructor(persistence: IPersistence<string>, defaultLast?: string, store = true) {
        this.last = persistence.persistable(['last'], undefined, defaultLast);
        this.store = store;
    }

    @action({ locking: 'exclusive' })
    public async echo(value: string): Promise<string> {
        await sleep(50);
        this.last.change(value);
        return value;
    }

    @action({ locking: 'exclusive' })
    public async getLastValue(): Promise<string | undefined> {
        await sleep(50);
        return this.last.value;
    }

    public async activate(): Promise<void> {
        if (this.store) {
            await this.last.load();
        }
    }

    public async deactivate() {
        if (this.store) {
            await this.last.store();
        }
    }
}

export interface IErrorActor {
    error(msg: string): Promise<void>;
}

export class ErrorActor implements IErrorActor {
    @action()
    public async error(msg: string): Promise<void> {
        throw new Error(msg);
    }
}
