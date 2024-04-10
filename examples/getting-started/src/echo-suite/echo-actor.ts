// src/echo-suite/echo-actor.ts:

import { IPersistable, action } from "@darlean/base";

export interface IEchoActorState {
    history: string[];
}

export class EchoActor {
    constructor(private state: IPersistable<IEchoActorState>, private name: string) {}

    public async activate() {
        await this.state.load();
        if (!this.state.hasValue()) {
            this.state.change({history: []});
        }
    }

    public async deactivate() {
        await this.state.persist();
    }

    @action()
    public async echo(message: string): Promise<string> {
        this.state.getValue().history.push(message);
        this.state.markDirty();
        // Optional: await this.state.persist();
        return `${this.name} says: ${message.toUpperCase()}`;
    }

    @action({locking: 'shared'})
    public async getHistory(): Promise<string[]> {
        return this.state.getValue().history;
    }

    @action()
    public async delete(): Promise<void> {
        this.state.clear();
        await this.state.persist();
    }
}