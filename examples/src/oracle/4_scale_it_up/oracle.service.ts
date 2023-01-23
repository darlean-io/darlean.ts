import { action, ITypedPortal } from '@darlean/base';
import { IOracleActor, IOracleService } from './oracle.intf';

// Implementation of the service that hides the implementation (OracleActor) from the user.
export class OracleService implements IOracleService {
    protected actorPortal: ITypedPortal<IOracleActor>;

    constructor(actorPortal: ITypedPortal<IOracleActor>) {
        this.actorPortal = actorPortal;
    }

    @action({ locking: 'shared' })
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action({ locking: 'shared' })
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the OracleActor for the specific topic
        const actor = this.actorPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
