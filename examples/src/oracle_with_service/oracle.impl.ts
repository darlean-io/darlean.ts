import { action, actor, IActorSuite, ITypedPortal, service } from '@darlean/base';
import { ActorSuite } from '@darlean/core';
import { currentScope } from '@darlean/utils';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';

interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}

const ORACLE_ACTOR = 'OracleActor';

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

@service()
class OracleService implements IOracleService {
    protected actorPortal: ITypedPortal<IOracleActor>;

    constructor(actorPortal: ITypedPortal<IOracleActor>) {
        this.actorPortal = actorPortal;
    }

    @action()
    public async ask(topic: string, question: string): Promise<number> {
        currentScope().info('Oracle service was asked for [Question] on topic [Topic]', () => ({
            Topic: topic,
            Question: question
        }));
        const actor = this.actorPortal.retrieve([topic]);
        return await actor.ask(question);
    }

    @action()
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        const actor = this.actorPortal.retrieve([topic]);
        return await actor.teach(fact, answer);
    }
}

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

export function suite(knowledge?: IKnowledgeTopics, hosts?: string[]): IActorSuite {
    const suite = new ActorSuite([
        {
            type: ORACLE_ACTOR,
            creator: (context) => {
                const topic = context.id[0];
                const k = topic ? knowledge?.[topic] : undefined;
                return new OracleActor(k);
            },
            hosts
        },
        {
            type: ORACLE_SERVICE,
            creator: (context) => {
                const actorPortal = context.portal.sub<IOracleActor>(ORACLE_ACTOR);
                return new OracleService(actorPortal);
            },
            hosts
        }
    ]);
    return suite;
}
