import { action, IActivatable, IDeactivatable, IPersistable, IVolatileTimer, timer } from '@darlean/base';
import { IOracleActor } from './oracle.intf';

export type Knowledge = { [fact: string]: number };

export class OracleActor implements IOracleActor, IActivatable, IDeactivatable {
    protected knowledge: IPersistable<Knowledge>;
    protected controller?: IOracleActor;
    protected refreshTimer: IVolatileTimer;

    constructor(persistable: IPersistable<Knowledge>, controller: IOracleActor | undefined, refreshTimer: IVolatileTimer) {
        this.knowledge = persistable;
        this.controller = controller;
        this.refreshTimer = refreshTimer;
    }

    public async activate(): Promise<void> {
        if (this.controller) {
            this.knowledge.change(await this.controller.fetch());
            this.refreshTimer.repeat(this.refetch, 10 * 1000);
        } else {
            await this.knowledge.load();
        }
    }

    public async deactivate(): Promise<void> {
        if (!this.controller) {
            await this.knowledge.persist();
        }
    }

    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge.getValue())) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        if (this.controller) {
            throw new Error('You can only teach a controller');
        }

        const knowledge = this.knowledge.getValue();
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        await this.knowledge.persist();
    }

    @action()
    public async fetch(): Promise<Knowledge> {
        return this.knowledge.getValue();
    }

    @timer()
    public async refetch(): Promise<void> {
        if (this.controller) {
            this.knowledge.change(await this.controller.fetch());
        }
    }
}
