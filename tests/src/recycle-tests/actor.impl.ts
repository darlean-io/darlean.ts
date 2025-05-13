import { action, ActorSuite, IActorSuite } from '@darlean/base';
import { randomUUID } from 'crypto';

export const RECYCLE_ACTOR = 'RecycleActor';
export const RECYCLE_ACTOR_WITH_MAX_AGE = 'RecycleActorWithMaxAge';

export interface IInvokeResult {
    node: string;
    id: string;
    instance: string;
    counter: number;
}

export class RecycleActor {
    private counter = -1;
    private instance = '';

    constructor(private node: string, private id: string, private finalizer: () => void) {
        this.instance = randomUUID();
    }

    @action({ locking: 'shared' })
    public async invoke(): Promise<IInvokeResult> {
        this.counter++;
        return {
            node: this.node,
            id: this.id,
            instance: this.instance,
            counter: this.counter
        };
    }

    @action()
    public async triggerFinalization() {
        this.finalizer();
    }
}

export function recycleActorSuite(node: string): IActorSuite {
    return new ActorSuite([
        {
            type: RECYCLE_ACTOR,
            kind: 'singular',
            capacity: 10,
            creator: (context) => {
                return new RecycleActor(node, context.id[0], () => context.performFinalization());
            }
        }
    ]);
}

export function recycleActorSuiteWithMaxAge(node: string): IActorSuite {
    return new ActorSuite([
        {
            type: RECYCLE_ACTOR_WITH_MAX_AGE,
            kind: 'singular',
            capacity: 1000,
            maxAgeSeconds: 5,
            creator: (context) => {
                return new RecycleActor(node, context.id[0], () => context.performFinalization());
            }
        }
    ]);
}
