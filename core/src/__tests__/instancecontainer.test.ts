import { sleep } from '@darlean/utils';
import { action, IActionError, IActivatable, IDeactivatable, IPersistence, ITypedPortal } from '@darlean/base';
import { MemoryPersistence } from '../various';
import { InstanceContainer } from '../instances';
import { EchoActor, ErrorActor, IEchoActor, IErrorActor } from '../testing';

export interface IMyActor {
    makeWarmer(amount: number): Promise<number>;
    via(temperature: number, amount: number): Promise<number>;
    error(): Promise<void>;
}

export class MyActor implements IMyActor, IActivatable, IDeactivatable {
    protected temperature?: number;
    protected persistence: IPersistence<number | undefined>;
    protected peers?: ITypedPortal<IMyActor>;

    public constructor(persistence: IPersistence<number | undefined>, peers?: ITypedPortal<IMyActor>, defaultTemp?: number) {
        this.persistence = persistence;
        this.temperature = defaultTemp;
        this.peers = peers;
    }

    @action({ locking: 'exclusive' })
    public async makeWarmer(amount: number): Promise<number> {
        const temp = this.temperature || 0;
        await sleep(50);
        this.temperature = temp + amount;
        return this.temperature;
    }

    @action()
    public async via(temperature: number, amount: number): Promise<number> {
        if (this.peers) {
            const peer = this.peers.retrieve([temperature.toString()]);
            return await peer.makeWarmer(amount);
        }
        return -1;
    }

    @action({ name: 'Error' })
    public async error() {
        throw new Error('Bla');
    }

    public async activate(): Promise<void> {
        this.temperature = ((await this.persistence.load(['temperature'])) as number) || this.temperature;
    }

    public async deactivate() {
        await this.persistence.store(['temperature'], [], this.temperature);
    }
}

describe('Instance container', () => {
    test('InstanceContainer - Basic action test', async () => {
        const persistence = new MemoryPersistence<string | undefined>();
        const f = new InstanceContainer<IEchoActor>((_id) => ({ instance: new EchoActor(persistence) }), 10);
        const i = f.obtain(['123']);

        expect(await i.echo('a')).toBe('a');
        // Check that we access the same actor instance on subsequent call
        expect(await i.getLastValue()).toBe('a');

        //expect(await i.makeWarmer(2)).toBe(5);

        // Delete the item from f (deactivate is invoked which stores the current temperature of 5 degrees).
        // Invoking it after deletion should throw an error.
        await f.delete(['123']);
        expect(() => i.echo('b')).toThrow();

        // Obtain a new instance. It should load the previously stored state of 5 degrees, so
        // adding 6 degrees should yield 11 degrees.
        const j = f.obtain(['123']);
        expect(await j.getLastValue()).toBe('a');
    });

    test('InstanceContainer - Basic action test - Error', async () => {
        // Tests that errors within an actor action are wrapped into ActorError objects.
        const f = new InstanceContainer<IErrorActor>((_d) => ({ instance: new ErrorActor() }), 10);
        const i = f.obtain(['123']);

        let error: IActionError | undefined;
        try {
            await i.error('Bla');
        } catch (e) {
            error = e as IActionError;
        }

        expect(error?.code).toBe('Error');
        expect(error?.kind).toBe('application');
        expect(error?.message).toBe('Bla');
    });
});
