import { action, IActivatable, IDeactivatable, IPersistable } from '@darlean/base';
import { IOracleActor } from './oracle.intf';

export type Knowledge = { [fact: string]: number };

export class OracleActor implements IOracleActor, IActivatable, IDeactivatable {
    protected knowledge: IPersistable<Knowledge>;

    constructor(persistable: IPersistable<Knowledge>) {
        this.knowledge = persistable;
    }

    public async activate(): Promise<void> {
        await this.knowledge.load();
        console.log('LOADED', this.knowledge.tryGetValue());
    }

    public async deactivate(): Promise<void> {
        await this.knowledge.persist();
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
        const knowledge = this.knowledge.getValue();
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        await this.knowledge.persist();
    }
}
