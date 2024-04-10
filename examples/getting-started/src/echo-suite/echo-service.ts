// src/echo-suite/echo-service.ts:

import { ITypedPortal, action } from "@darlean/base";
import { EchoActor } from "./echo-actor";

export class EchoService {
    constructor(private portal: ITypedPortal<EchoActor>) {}

    @action({locking: 'shared'})
    public async echo(name: string, message: string): Promise<string> {
        const actor = this.portal.retrieve([name]);
        return await actor.echo(message);
    }

    @action({locking: 'shared'})
    public async getHistory(name: string): Promise<string[]> {
        const actor = this.portal.retrieve([name]);
        return await actor.getHistory();
    }

    @action({locking: 'shared'})
    public async delete(name: string): Promise<void> {
        const actor = this.portal.retrieve([name]);
        await actor.delete();
    }
}