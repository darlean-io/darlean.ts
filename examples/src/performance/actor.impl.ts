import { action, ActorSuite, IActorSuite } from '@darlean/base';
import { sleep } from '@darlean/utils';
import { IPerformanceActor, PERFORMANCE_ACTOR } from './actor.intf';

class PerformanceActor implements IPerformanceActor {
    protected sum = 0;

    @action()
    public async add(amount: number, sleepAmount: number): Promise<number> {
        this.sum += amount;
        if (sleepAmount > 0) {
            await sleep(sleepAmount);
        }
        return this.sum;
    }
    
    @action()
    public async get(): Promise<number> {
        throw new Error('Method not implemented.');
    }
}
 
export function suite(): IActorSuite {
    return new ActorSuite([
        {
            type: PERFORMANCE_ACTOR,
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
