import { MultiDeSer, sleep, Time } from '@darlean/utils';
import { InProcessTransport } from '../infra/inprocesstransport';
import { InstanceContainer, MultiTypeInstanceContainer } from '../instances';
import { ActorRegistry, ExponentialBackOff, RemotePortal } from '../remoteinvocation';
import { EchoActor, IEchoActor } from '../testing';
import { TransportRemote } from '../transportremote';
import { MemoryPersistence } from '../various';

// Tests for using the RemotePortal with a InProcessTransport for local actor invocation

describe('Local portal', () => {
    test('Local portal test', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 1, 4);
        const mc = new MultiTypeInstanceContainer();
        const deser = new MultiDeSer();
        const transport = new InProcessTransport(deser);
        const registry = new ActorRegistry();
        const remote = new TransportRemote('local', transport, mc);
        const persistence = new MemoryPersistence<string>();
        const p = new RemotePortal(remote, backoff, registry);
        const cont = new InstanceContainer<IEchoActor>(
            'EchoActor',
            (_id) => ({ instance: new EchoActor(persistence) }),
            10,
            undefined
        );
        mc.register('MyActor', cont);
        mc.register('AnotherActor', cont);
        registry.addMapping('MyActor', 'local');
        registry.addMapping('AnotherActor', 'local');
        await remote.init();

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        expect(await a.echo('a')).toBe('a');

        const b = p.retrieve<IEchoActor>('AnotherActor', ['b']);
        expect(await b.echo('b')).toBe('b');

        const c = p.retrieve<IEchoActor>('UndefinedActor', ['c']);
        expect(async () => await c.echo('c')).rejects.toThrow();

        await mc.finalize();
        await remote.finalize();
        await sleep(1000);
    });

    test('Portal items survive deactivation', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 1, 4);
        const mc = new MultiTypeInstanceContainer();
        const deser = new MultiDeSer();
        const transport = new InProcessTransport(deser);
        const registry = new ActorRegistry();
        const remote = new TransportRemote('local', transport, mc);
        const p = new RemotePortal(remote, backoff, registry);
        const persistence = new MemoryPersistence<string>();

        const cont = new InstanceContainer<IEchoActor>(
            'EchoActor',
            (_id) => ({ instance: new EchoActor(persistence, undefined, false) }),
            10,
            undefined
        );
        mc.register('MyActor', cont);
        registry.addMapping('MyActor', 'local');

        await remote.init();

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        expect(await a.echo('a')).toBe('a');

        // After deletion of a from the container, we expect that we can still use our
        // a variable to access the actor (albeit a new instance)
        await cont.delete(['a']);

        // We expect a new underlying actor instance
        expect(await a.getLastValue()).toBe(undefined);
        // And we expect the echo functionality to just work
        expect(await a.echo('b')).toBe('b');

        await mc.finalize();
        await remote.finalize();
        await sleep(1000);
    });
});
