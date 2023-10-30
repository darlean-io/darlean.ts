import { action, ActorSuite, IActorSuite } from '@darlean/base';
import { sleep } from '@darlean/utils';
import { IPerformanceActor, PERFORMANCE_ACTOR_STATIC, PERFORMANCE_ACTOR_VIRTUAL } from './actor.intf';

class PerformanceActor implements IPerformanceActor {
    protected sum = 0;

    @action({ locking: 'shared' })
    public async add(amount: number, sleepAmount: number): Promise<number> {
        this.sum += amount;
        if (sleepAmount > 0) {
            await sleep(sleepAmount);
        }
        return this.sum;
    }

    @action({ locking: 'shared' })
    public async addPure(amount: number): Promise<number> {
        this.sum += amount;
        return this.sum;
    }

    @action()
    public async get(): Promise<number> {
        throw new Error('Method not implemented.');
    }
}

export function static_suite(): IActorSuite {
    return new ActorSuite([
        {
            type: PERFORMANCE_ACTOR_STATIC,
            kind: 'multiplar',
            placement: {
                version: '20230112',
                bindIdx: 0
            },
            // Factory function that creates a new actor instance
            creator: (_context) => {
                return new PerformanceActor();
            }
        }
    ]);
}

export function virtual_suite(): IActorSuite {
    return new ActorSuite([
        {
            type: PERFORMANCE_ACTOR_VIRTUAL,
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (_context) => {
                return new PerformanceActor();
            }
        }
    ]);
}
