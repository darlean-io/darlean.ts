import { action, ActorSuite, IActorSuite, ITimerOptions, ITimersService, timer, TIMERS_SERVICE } from '@darlean/base';
import { ITime } from '@darlean/utils';

export const TIMER_TEST_ACTOR = 'TimerTestActor';

export interface ITextState {
    text: string;
}

export class TimerTestActor {
    protected service: ITimersService;
    protected id: string[];
    protected moments: number[];
    protected errorAt: number[];
    protected time: ITime;

    constructor(service: ITimersService, id: string[], time: ITime) {
        this.service = service;
        this.id = id;
        this.moments = [];
        this.time = time;
        this.errorAt = [];
    }

    @action({ locking: 'shared' })
    public async schedule(options: ITimerOptions, errorAt?: number[]) {
        this.moments = [this.time.machineTime()];
        this.errorAt = errorAt ?? [];
        options.callbackActorType = TIMER_TEST_ACTOR;
        options.callbackActorId = this.id;
        options.callbackActionName = 'HandleTimerEvent';
        await this.service.schedule(options);
    }

    @action({ locking: 'shared' })
    public async cancel(id: string) {
        await this.service.cancel({id});
    }

    @action({ locking: 'exclusive'})
    public async getMoments(): Promise<number[]> {
        return this.moments;
    }

    @timer({ locking: 'shared' })
    public async HandleTimerEvent(): Promise<void> {
        const n = this.moments.length - 1;
        this.moments.push(this.time.machineTime())
        if (this.errorAt.includes(n)) {
            throw new Error('Test error');
        }
    }
}

export function timerTestActorSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: TIMER_TEST_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const service = context.portal.retrieve<ITimersService>(TIMERS_SERVICE, []);
                return new TimerTestActor(service, context.id, context.time);
            }
        }
    ]);
}
