import { action, actor, IActorSuite } from '@darlean/base';
import { ActorSuite } from '@darlean/core';
import { IOracleActor, ORACLE_ACTOR } from './oracle.intf';

@actor()
class OracleActor implements IOracleActor {
    protected knowledge: Map<string, number>;

    constructor(knowledge?: { [fact: string]: number }) {
        this.knowledge = new Map();
        if (knowledge) {
            for (const [fact, answer] of Object.entries(knowledge)) {
                this.knowledge.set(fact, answer);
            }
        }
    }

    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of this.knowledge.entries()) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        this.knowledge.set(fact, answer);
    }
}

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

export function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    const suite = new ActorSuite([
        {
            type: ORACLE_ACTOR,
            creator: (context) => {
                const topic = context.id[0];
                const k = topic ? knowledge?.[topic] : undefined;
                return new OracleActor(k);
            }
        }
    ]);
    return suite;
}
