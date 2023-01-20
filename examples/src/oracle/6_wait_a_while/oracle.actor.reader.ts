import { action, IAbortable, IActivatable, IDeactivatable, IVolatileTimer, IVolatileTimerHandle, timer } from '@darlean/base';
import { IOracleControllerActor, IOracleReaderActor, Knowledge } from './oracle.intf';
import { Aborter } from '@darlean/utils';

export class OracleReaderActor implements IOracleReaderActor, IActivatable, IDeactivatable {
    protected knowledge: Knowledge;
    protected controller: IOracleControllerActor & IAbortable;
    protected pollTimer: IVolatileTimer;
    protected pollHandle?: IVolatileTimerHandle;
    protected pollAborter?: Aborter;
    protected nonce = '';

    constructor(controller: IOracleControllerActor & IAbortable, pollTimer: IVolatileTimer) {
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
