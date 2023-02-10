import { action, IActivatable, IDeactivatable, IPersistable, IPersistence } from '@darlean/base';
import * as uuid from 'uuid';
import { PollController } from '@darlean/utils';
import { Knowledge } from './oracle.intf';

export class OracleControllerActor implements OracleControllerActor, IActivatable, IDeactivatable {
    protected knowledge: IPersistable<Knowledge>;
    protected nonce = '';
    protected pollController: PollController<boolean>;

    constructor(persistence: IPersistence<Knowledge>, knowledge?: Knowledge) {
        this.knowledge = persistence.persistable(['knowledge'], undefined, knowledge ?? {});
        this.pollController = new PollController();
    }

    public async activate(): Promise<void> {
        await this.knowledge.load();
        this.nonce = uuid.v4();
    }

    public async deactivate(): Promise<void> {
        await this.knowledge.store();
        this.pollController.interrupt(false);
        this.pollController.finalize();
    }

    @action({ locking: 'exclusive' })
    public async teach(fact: string, answer: number): Promise<void> {
        const knowledge = this.knowledge.value ?? {};
        knowledge[fact] = answer;
        this.knowledge.change(knowledge);
        this.nonce = uuid.v4();
        this.pollController.interrupt(true);
        await this.knowledge.store();
    }

    @action({ locking: 'none' })
    public async fetch(nonce: string): Promise<{ nonce: string; knowledge: Knowledge }> {
        if (nonce === this.nonce) {
            await this.pollController?.wait(10 * 1000);
        }

        return {
            nonce: this.nonce,
            knowledge: this.knowledge.value ?? {}
        };
    }
}
