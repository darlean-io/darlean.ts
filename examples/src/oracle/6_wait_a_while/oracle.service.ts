import { action, ITypedPortal } from '@darlean/base';
import { IOracleControlActor, IOracleReadActor, IOracleService } from './oracle.intf';

const NR_READERS = 100;

// Implementation of the service that hides the implementation (OracleActor) from the user.
export class OracleService implements IOracleService {
    protected controlPortal: ITypedPortal<IOracleControlActor>;
    protected readerPortal: ITypedPortal<IOracleReadActor>;

    constructor(controlPortal: ITypedPortal<IOracleControlActor>, readerPortal: ITypedPortal<IOracleReadActor>) {
        this.controlPortal = controlPortal;
        this.readerPortal = readerPortal;
    }

    @action()
    public async ask(topic: string, question: string): Promise<number> {
        // Retrieve a proxy to a random reader OracleActor for the specific topic
        const actor = this.readerPortal.retrieve([topic, Math.floor(Math.random() * NR_READERS).toString()]);
        // Ask the actor the question, and return the answer
        return await actor.ask(question);
    }

    @action()
    public async teach(topic: string, fact: string, answer: number): Promise<void> {
        // Retrieve a proxy to the controller OracleActor for the specific topic
        const actor = this.controlPortal.retrieve([topic]);
        // Teach the new fact to the actor
        return await actor.teach(fact, answer);
    }
}
