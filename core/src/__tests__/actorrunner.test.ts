import { ActorRunnerBuilder } from '../running';
import { sleep } from '@darlean/utils';
import { action, IPersistence, ITypedPortal } from '@darlean/base';
import { MemoryPersistence } from '../various';
import { EchoActor, IEchoActor } from '../testing';
import { InProcessTransport } from '../infra/inprocesstransport';
import { BsonDeSer } from '../infra/bsondeser';

export interface IViaEchoActor {
    echo(id: string, value: string): Promise<string | undefined>;
}

export class ViaEchoActor implements IViaEchoActor {
    protected peers: ITypedPortal<IEchoActor>;

    public constructor(peers: ITypedPortal<IEchoActor>) {
        this.peers = peers;
    }

    @action({ locking: 'exclusive' })
    public async echo(id: string, value: string): Promise<string | undefined> {
        const peer = this.peers.retrieve([id]);
        return await peer.echo(value);
    }
}

describe('Actor runner & builder', () => {
    test('Actor runner - persistence', async () => {
        const builder = new ActorRunnerBuilder();
        builder.registerActor({
            creator: (context) => new EchoActor(context.persistence as IPersistence<string | undefined>, context.id[2] || ''),
            type: 'MyActor',
            capacity: 10
        });
        const app = builder.build();

        const portal = app.getPortal();
        const sub = portal.typed<IEchoActor>('MyActoR');

        const a0 = sub.retrieve(['123']);

        // Check that invoking an action on one retrieved actor proxy is observed by another one
        // (for the same id)
        expect(await a0.getLastValue()).toBe('');
        await a0.echo('A');
        const a1 = sub.retrieve(['123']);
        expect(await a1.getLastValue()).toBe('A');
        // The changed value should not be visible for another id
        const a2 = sub.retrieve(['233']);
        expect(await a2.getLastValue()).toBe('');

        // Clear persistence
        (builder.getPersistence() as MemoryPersistence<unknown>).clear();

        // Call should still succeed, actor should have old value in memory
        expect(await a0.getLastValue()).toBe('A');

        // Push current instances out of container. Existing actor should store
        // value, even though persistence was cleared before
        for (let i = 0; i < 10; i++) {
            const a = sub.retrieve(['additional', i.toString()]);
            expect(await a.getLastValue()).toBe('');
        }

        // Give container the time to clean up - an asynchronous background process
        await sleep(100);

        // Persistence is cleared, but value was stored after clear, expect it still to be
        // available to the actor.
        expect(await a0.getLastValue()).toBe('A');

        // Push current instances out of container
        for (let i = 0; i < 10; i++) {
            const a = sub.retrieve(['extra-additional', i.toString()]);
            expect(await a.getLastValue()).toBe('');
        }

        // Give container the time to clean up - an asynchronous background process
        await sleep(100);

        // Clear persistence
        (builder.getPersistence() as MemoryPersistence<unknown>).clear();

        // Persistence is cleared, value was stored before clear, expect no value is present for actor
        expect(await a0.getLastValue()).toBe('');
    });

    test('Actor runner - local portal', async () => {
        // Test the local portal functionality by having one actor invoke another actor
        const builder = new ActorRunnerBuilder();

        builder.registerActor({
            creator: (context) => new ViaEchoActor(context.portal.typed<IEchoActor>('EchoActor')),
            type: 'ViaEchoActor',
            capacity: 10
        });

        builder.registerActor({
            creator: (context) => new EchoActor(context.persistence as IPersistence<string | undefined>, context.id[0] || ''),
            type: 'EchoActor',
            capacity: 10
        });

        const app = builder.build();

        await app.start();

        const portal = app.getPortal();
        // En passent, test that case and underscore does not matter in actor name
        const viaPortal = portal.typed<IViaEchoActor>('VIAEcho_ActoR');
        const echoPortal = portal.typed<IEchoActor>('Echo_ActoR');

        // Test that one actor can invoke another actor
        const via123 = viaPortal.retrieve(['123']);
        const echoA = echoPortal.retrieve(['A']);
        expect(await via123.echo('A', 'AA')).toBe('AA');
        expect(await echoA.getLastValue()).toBe('AA');

        // Test that invoking yet another actor does not influence original actor
        expect(await via123.echo('B', 'BB')).toBe('BB');
        expect(await echoA.getLastValue()).toBe('AA');

        await app.stop();
    });

    test('Actor runner - remote portal - single app', async () => {
        // Test the remote portal functionality by having one actor invoke another actor, where
        // all actors live in the same app
        const builder = new ActorRunnerBuilder();

        builder.registerActor({
            creator: (context) => new ViaEchoActor(context.portal.typed<IEchoActor>('EchoActor')),
            type: 'ViaEchoActor',
            capacity: 10,
            hosts: ['my-app']
        });

        builder.registerActor({
            creator: (context) => new EchoActor(context.persistence as IPersistence<string | undefined>, context.id[0] || ''),
            type: 'EchoActor',
            capacity: 10,
            hosts: ['my-app']
        });

        const transport = new InProcessTransport(new BsonDeSer());
        builder.setRemoteAccess('my-app', transport);
        const app = builder.build();

        await app.start();

        const portal = app.getPortal();
        // En passent, test that case and underscore does not matter in actor name
        const viaPortal = portal.typed<IViaEchoActor>('VIAEcho_ActoR');
        const echoPortal = portal.typed<IEchoActor>('Echo_ActoR');

        // Test that one actor can invoke another actor
        const via123 = viaPortal.retrieve(['123']);
        const echoA = echoPortal.retrieve(['A']);
        expect(await via123.echo('A', 'AA')).toBe('AA');
        expect(await echoA.getLastValue()).toBe('AA');

        // Test that invoking yet another actor does not influence original actor
        expect(await via123.echo('B', 'BB')).toBe('BB');
        expect(await echoA.getLastValue()).toBe('AA');

        await app.stop();
    });
});
