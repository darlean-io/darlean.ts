import { Time } from '@darlean/utils';
import { IActionError, IActorCallResponse, IInvokeOptions, IInvokeResult, IRemote } from '@darlean/base';
import { ActorRegistry, ExponentialBackOff, RemotePortal } from '../remoteinvocation';
import { IEchoActor } from '../testing';

// Always returns a framework error
export class NotImplementedRemote implements IRemote {
    public async invoke(_options: IInvokeOptions): Promise<IInvokeResult> {
        return {
            errorCode: 'TEST_FRAMEWORK_ERROR'
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

// Always returns an application error
export class ErrorRemote implements IRemote {
    public async invoke(_options: IInvokeOptions): Promise<IInvokeResult> {
        return {
            content: {
                error: {
                    kind: 'application',
                    code: 'MY_ERROR',
                    message: 'My error',
                    template: 'My error',
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
        const registry = new ActorRegistry();
        const p = new RemotePortal(remote, backoff, registry);

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: IActionError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as IActionError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.kind).toBe('framework');
        expect(error?.nested?.length).toBeGreaterThanOrEqual(5);
        expect(duration).toBeGreaterThan(1000);
    }, 10000);

    test('Remote Portal - Registered - Framework error', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new NotImplementedRemote();
        const registry = new ActorRegistry();
        const p = new RemotePortal(remote, backoff, registry);
        registry.addMapping('MyActor', 'A');

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: IActionError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as IActionError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.kind).toBe('framework');
        expect(error?.nested?.length).toBeGreaterThanOrEqual(5);
        expect(error?.nested?.[0]?.kind).toBe('framework');
        expect(error?.nested?.[0]?.code).toBe('TEST_FRAMEWORK_ERROR');
        expect(duration).toBeGreaterThan(1500);
    }, 10000);

    test('Remote Portal - Registered - Application error', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new ErrorRemote();
        const registry = new ActorRegistry();
        const p = new RemotePortal(remote, backoff, registry);
        registry.addMapping('MyActor', 'A');

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        const start = time.machineTicks();
        let error: IActionError | undefined;
        try {
            await a.echo('');
        } catch (e) {
            error = e as IActionError;
        }
        const stop = time.machineTicks();
        const duration = stop - start;
        expect(error).toBeDefined();
        expect(error?.kind).toBe('application');
        expect(error?.code).toBe('MY_ERROR');
        expect(duration).toBeLessThan(50);
    }, 10000);

    test('Remote Portal - Suddenly registered', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const remote = new EchoRemote();
        const registry = new ActorRegistry();
        const p = new RemotePortal(remote, backoff, registry);

        setTimeout(() => {
            registry.addMapping('MyActor', 'A');
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
        const registry = new ActorRegistry();
        const p = new RemotePortal(remote, backoff, registry);

        setTimeout(() => {
            registry.addMapping('MyActor', 'A', { version: '1', bindIdx: 1 });
            registry.addMapping('MyActor', 'B', { version: '1', bindIdx: 1 });
            registry.addMapping('MyActor', 'C', { version: '2', bindIdx: 0 });
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
