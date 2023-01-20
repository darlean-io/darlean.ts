import {
    action,
    IAbortable,
    IActivatable,
    IDeactivatable,
    IPersistable,
    IPersistence,
    IVolatileTimer,
    IVolatileTimerHandle,
    timer
} from '@darlean/base';
import { IOracleControlActor, IOracleReadActor } from './oracle.intf';
import * as uuid from 'uuid';
import { Aborter, PollController } from '@darlean/utils';

export type Knowledge = { [fact: string]: number };

export class OracleControlActor implements IOracleControlActor, IActivatable, IDeactivatable {
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

export class OracleReadActor implements IOracleReadActor, IActivatable, IDeactivatable {
    protected knowledge: Knowledge;
    protected controller: IOracleControlActor & IAbortable;
    protected pollTimer: IVolatileTimer;
    protected pollHandle?: IVolatileTimerHandle;
    protected pollAborter?: Aborter;
    protected nonce = '';

    constructor(controller: IOracleControlActor & IAbortable, pollTimer: IVolatileTimer) {
        this.knowledge = {};
        this.controller = controller;
        this.pollTimer = pollTimer;
    }

    public async activate(): Promise<void> {
        const result = await this.controller.fetch('');
        this.knowledge = result.knowledge;
        this.nonce = result.nonce;
        this.pollHandle = this.pollTimer.repeat(this.refetch, 0, 0);
    }

    public async deactivate(): Promise<void> {
        this.pollAborter?.abort();
    }

    @action({ locking: 'shared' })
    public async ask(question: string): Promise<number> {
        for (const [fact, answer] of Object.entries(this.knowledge)) {
            if (question.includes(fact)) {
                return answer;
            }
        }
        return 42;
    }

    @timer({ locking: 'none' })
    public async refetch(): Promise<void> {
        if (this.controller) {
            try {
                const aborter = new Aborter();
                this.pollAborter = aborter;
                this.controller.aborter(aborter);
                const result = await this.controller.fetch(this.nonce);
                this.knowledge = result.knowledge;
                this.nonce = result.nonce;
            } catch (e) {
                // When an error occurs, do not resume immediately. It could be that the
                // error occurs immediately, and that would effectively cause full CPU load
                // which is what we want to avoid.
                this.pollHandle?.resume(1000);
            }
        }
    }
}
