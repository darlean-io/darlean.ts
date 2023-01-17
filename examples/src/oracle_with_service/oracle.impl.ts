import {
    action,
    ActorSuite,
    IActivatable,
    IActorSuite,
    IDeactivatable,
    IPersistable,
    IPersistence,
    ITypedPortal
} from '@darlean/base';
import { IOracleService, ORACLE_SERVICE } from './oracle.intf';

interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}

const ORACLE_ACTOR = 'OracleActor';

type Knowledge = { [fact: string]: number };

// Implementation of a virtual actor that has the knowledge about one topic
class OracleActor implements IOracleActor, IActivatable, IDeactivatable {
    protected knowledge: IPersistable<Knowledge>;

    constructor(persistence: IPersistence<Knowledge>, knowledge?: Knowledge) {
        this.knowledge = persistence.persistable(['knowledge'], undefined, knowledge ?? {});
    }

    public async activate(): Promise<void> {
        await this.knowledge.load();
        console.log('LOADED', this.knowledge.value);
    }

    public async deactivate(): Promise<void> {
        await this.knowledge.store();
    }

    @action()
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge.value || {})) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @action()
    public async teach(fact: string, answer: number): Promise<void> {
        if (this.knowledge.value) {
            this.knowledge.value[fact] = answer;
            this.knowledge.change();
            await this.knowledge.store();
        }
    }
}

// Implementation of the service that hides the implementation (OracleActor) from the user.
class OracleService implements IOracleService {
    protected actorPortal: ITypedPortal<IOracleActor>;

    constructor(actorPortal: ITypedPortal<IOracleActor>) {
        this.actorPortal = actorPortal;
    }

    @action()
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action()
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

// Application code can invoke this suite function to register the oracle actors
// (OracleService and OracleActor) to their actor runner.
export function suite(knowledge?: IKnowledgeTopics, hosts?: string[]): IActorSuite {
    return new ActorSuite([
        // Registration of the OracleActor virtual actor
        {
            type: ORACLE_ACTOR,
            // Singular: there is only one actor instance active at any moment for the same actor type and id
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Lookup relevant facts for the topic in the knowledge
                const k = topic ? knowledge?.[topic] : undefined;
                const p = context.persistence as IPersistence<Knowledge>;
                // Create and return a new OracleActor instance with the provided knowledge
                return new OracleActor(p, k);
            },
            hosts
        },
        // Registration of the OracleService service actor
        {
            type: ORACLE_SERVICE,
            // Multiplar: there can be more than one actor instance active at any moment for the same actor type and id
            kind: 'multiplar',
            creator: (context) => {
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor instances
                const actorPortal = context.portal.typed<IOracleActor>(ORACLE_ACTOR);
                // Create and return a new OracleService with the typed portal
                return new OracleService(actorPortal);
            },
            hosts
        }
    ]);
}
