import { Time } from '@darlean/utils';
import { IActorCallResponse, IActorError, IInvokeOptions, IInvokeResult, InvokeError, IRemote } from '@darlean/base';
import { ExponentialBackOff, RemotePortal } from '../remoteinvocation';
import { IEchoActor } from '../testing';

// Always returns a framework error
export class NotImplementedRemote implements IRemote {
    public async invoke(_options: IInvokeOptions): Promise<IInvokeResult> {
        return {
            errorCode: 'NOT_IMPLEMENTED'
        };
    }
}

// Echoes back the invoke options as result value
export class EchoRemote implements IRemote {
    public async invoke(options: IInvokeOptions): Promise<IInvokeResult> {
        return {
            content: {
                result: options
            } as IActorCallResponse
        };
    }
}

// Always returns an actor error
export class ErrorRemote implements IRemote {
    public async invoke(_options: IInvokeOptions): Promise<IInvokeResult> {
        return {
            content: {
                error: {
                    code: 'MY_ERROR',
                    message: 'My error',
                    parameters: {
                        a: 5
                    }
                }
            } as IActorCallResponse
        };
    }
}

describe('Remote portal', () => {
    test('Remote Portal - Not registered', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new NotImplementedRemote();
        const p = new RemotePortal(remote, backoff);

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: InvokeError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as InvokeError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.attempts).toHaveLength(5);
        expect(duration).toBeGreaterThan(1000);
    }, 10000);

    test('Remote Portal - Registered - Framework error', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new NotImplementedRemote();
        const p = new RemotePortal(remote, backoff);
        p.addMapping('MyActor', 'A');

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: InvokeError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as InvokeError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.attempts).toHaveLength(5);
        expect(error?.attempts[0].result.errorCode).toBe('NOT_IMPLEMENTED');
        expect(duration).toBeGreaterThan(1500);
    }, 10000);

    test('Remote Portal - Registered - Actor error', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new ErrorRemote();
        const p = new RemotePortal(remote, backoff);
        p.addMapping('MyActor', 'A');

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: IActorError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as IActorError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.code).toBe('MY_ERROR');
        expect(duration).toBeLessThan(50);
    }, 10000);

    test('Remote Portal - Suddenly registered', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new EchoRemote();
        const p = new RemotePortal(remote, backoff);

        setTimeout(() => {
            p.addMapping('MyActor', 'A');
        }, 300);

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        const result = (await a.echo('')) as unknown as IInvokeOptions;
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(result.destination).toBe('A');
        expect(duration).toBeGreaterThan(250);
        expect(duration).toBeLessThan(2500);
    }, 10000);

    test('Remote Portal - Suddenly registered - BindIdx', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new EchoRemote();
        const p = new RemotePortal(remote, backoff);

        setTimeout(() => {
            p.addMapping('MyActor', 'A', { version: '1', bindIdx: 1 });
            p.addMapping('MyActor', 'B', { version: '1', bindIdx: 1 });
            p.addMapping('MyActor', 'C', { version: '2', bindIdx: 0 });
        }, 300);

        const a = p.retrieve<IEchoActor>('MyActor', ['B', 'A']);
        const start = time.machineTicks();
        try {
            (await a.echo('')) as unknown as IInvokeOptions;
        } catch (e) {
            console.log(JSON.stringify(e));
            throw e;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        //expect(result.destination).toBe('B');
        expect(duration).toBeGreaterThan(250);
        expect(duration).toBeLessThan(2500);
    }, 10000);
});
