import { Logger } from '@darlean/utils';
import { Time } from '@darlean/utils';
import { sleep } from '@darlean/utils';
import { action, IActivatable, IVolatileTimer, IVolatileTimerHandle } from '@darlean/base';
import { InstanceWrapper, VolatileTimer } from '../instances';

class TimerActor implements IActivatable {
    public count = 0;

    protected timer: IVolatileTimer;
    protected handle?: IVolatileTimerHandle;

    constructor(timer: IVolatileTimer) {
        this.timer = timer;
    }

    public async activate(): Promise<void> {
        this.handle = this.timer?.repeat(this.tick, 100);
    }

    @action()
    public async tick() {
        this.count++;
    }
}

describe('Volatile timer', () => {
    test('VolatileTimer basic test', async () => {
        new Logger();
        const time = new Time();
        const timer = new VolatileTimer<TimerActor>(time);
        const actor = new TimerActor(timer);
        const wrapper = new InstanceWrapper('TimerActor', actor, undefined);
        timer.setWrapper(wrapper);

        await wrapper.invoke(undefined, []);

        await sleep(550);

        // console.log('Stopping timer actor');
        await wrapper.deactivate();
        await sleep(500);

        expect(actor.count).toBeGreaterThanOrEqual(4);
        expect(actor.count).toBeLessThanOrEqual(7);
    });
});
