import { action, ITypedPortal } from '@darlean/base';
import { IOracleActor, IOracleService } from './oracle.intf';

const NR_FOLLOWERS = 100;

// Implementation of the service that hides the implementation (OracleActor) from the user.
export class OracleService implements IOracleService {
    protected actorPortal: ITypedPortal<IOracleActor>;

    constructor(actorPortal: ITypedPortal<IOracleActor>) {
        this.actorPortal = actorPortal;
    }

    @action()
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to a random follower OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic, Math.floor(Math.random() * NR_FOLLOWERS).toString()]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action()
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the controller OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
