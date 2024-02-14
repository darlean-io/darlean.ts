import { TransportRemote } from '../transportremote';
import { NatsTransport } from '../infra/natstransport';
import { MultiDeSer, Time } from '@darlean/utils';
import { InstanceContainer, MultiTypeInstanceContainer } from '../instances';
import { ActorRegistry, ExponentialBackOff, RemotePortal } from '../remoteinvocation';
import { NatsServer } from '../infra/natsserver';
import { IEchoActor, EchoActor } from '../testing';
import { MemoryPersistence } from '../various';

describe('Nats', () => {
    test('Remote via Nats', async () => {
        const time = new Time();
        const backoff = new ExponentialBackOff(time, 10, 4);
        const deser = new MultiDeSer();

        const natsserver = new NatsServer();
        natsserver.start();

        const registry = new ActorRegistry();

        const nats0 = new NatsTransport(deser);
        const container0 = new MultiTypeInstanceContainer();
        const persistence = new MemoryPersistence<string>();
        const cont0 = new InstanceContainer<IEchoActor>(
            'EchoActor',
            (_id) => ({ instance: new EchoActor(persistence) }),
            10,
            undefined
        );
        container0.register('myactor', cont0);
        const remote0 = new TransportRemote('app0', nats0, container0);
        const p0 = new RemotePortal(remote0, backoff, registry);
        registry.addMapping('myactor', 'app1');
        await remote0.init();

        const nats1 = new NatsTransport(deser);
        const container1 = new MultiTypeInstanceContainer();
        const cont1 = new InstanceContainer<IEchoActor>(
            'EchoActor',
            (_id) => ({ instance: new EchoActor(persistence) }),
            10,
            undefined
        );
        container1.register('myactor', cont1);
        const remote1 = new TransportRemote('app1', nats1, container1);
        new RemotePortal(remote1, backoff, registry);
        await remote1.init();

        const mya = p0.retrieve<IEchoActor>('myactor', ['123']);
        expect(await mya.echo('Hello')).toBe('Hello');

        await remote0.finalize();
        await remote1.finalize();
        natsserver.stop();
    }, 20000);
});
