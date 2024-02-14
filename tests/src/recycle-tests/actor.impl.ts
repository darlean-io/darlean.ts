import { action, ActorSuite, IActorSuite } from '@darlean/base';

export const RECYCLE_ACTOR = 'RecycleActor';
export const RECYCLE_ACTOR_WITH_MAX_AGE = 'RecycleActorWithMaxAge';

export interface IInvokeResult {
    node: string;
    id: string;
    counter: number;
}

export class RecycleActor {
    private counter = -1;

    constructor(private node: string, private id: string, private finalizer: () => void) {}

    @action({ locking: 'shared' })
    public async invoke(): Promise<IInvokeResult> {
        this.counter++;
        return {
            node: this.node,
            id: this.id,
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
            capacity: 10,
            maxAgeSeconds: 5,
            creator: (context) => {
                return new RecycleActor(node, context.id[0], () => context.performFinalization());
            }
        }
    ]);
}
