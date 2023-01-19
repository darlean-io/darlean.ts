import { action } from '@darlean/base';
import { IOracleActor } from './oracle.intf';

export type Knowledge = { [fact: string]: number };

export class OracleActor implements IOracleActor {
    protected knowledge: Knowledge;

    constructor(knowledge?: Knowledge) {
        this.knowledge = knowledge ?? {};
    }

    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge)) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        this.knowledge[fact] = answer;
    }
}
