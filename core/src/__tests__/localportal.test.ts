import { LocalPortal } from '../localinvocation';
import { InstanceContainer } from '../instances';
import { EchoActor, IEchoActor } from '../testing';

describe('Local portal', () => {
    test('Local portal test', async () => {
        const p = new LocalPortal();
        const cont = new InstanceContainer<IEchoActor>((_id) => ({ instance: new EchoActor() }), 10);
        p.register('MyActor', cont);
        p.register('AnotherActor', cont);

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        expect(await a.echo('a')).toBe('a');

        const b = p.retrieve<IEchoActor>('AnotherActor', ['b']);
        expect(await b.echo('b')).toBe('b');

        const c = p.retrieve<IEchoActor>('UndefinedActor', ['c']);
        expect(async () => await c.echo('c')).rejects.toThrow();
    });

    test('Portal items survive deactivation', async () => {
        const p = new LocalPortal();
        const cont = new InstanceContainer<IEchoActor>((_id) => ({ instance: new EchoActor() }), 10);
        p.register('MyActor', cont);

        const a = p.retrieve<IEchoActor>('MyActor', ['a']);
        expect(await a.echo('a')).toBe('a');

        // After deletion of a from the container, we expect that we can still use our
        // a variable to access the actor (albeit a new instance)
        await cont.delete(['a']);

        // We expect a new underlying actor instance
        expect(await a.getLastValue()).toBe(undefined);
        // And we expect the echo functionality to just work
        expect(await a.echo('b')).toBe('b');
    });
});
