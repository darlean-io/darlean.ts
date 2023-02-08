import { action, ITypedPortal } from '@darlean/base';
import { IOracleControllerActor, IOracleFollowerActor, IOracleService } from './oracle.intf';

const NR_FOLLOWERS = 100;

// Implementation of the service that hides the implementation (OracleActor) from the user.
export class OracleService implements IOracleService {
    protected controlPortal: ITypedPortal<IOracleControllerActor>;
    protected followerPortal: ITypedPortal<IOracleFollowerActor>;

    constructor(controlPortal: ITypedPortal<IOracleControllerActor>, followerPortal: ITypedPortal<IOracleFollowerActor>) {
        this.controlPortal = controlPortal;
        this.followerPortal = followerPortal;
    }

    @action({ locking: 'shared' })
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to a random follower OracleActor for the specific topic
        const actor = this.followerPortal.retrieve([topic, Math.floor(Math.random() * NR_FOLLOWERS).toString()]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action({ locking: 'shared' })
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the controller OracleActor for the specific topic
        const actor = this.controlPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
