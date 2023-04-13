import { action, ActorSuite, IActorSuite } from '@darlean/base';

export const ECHO_ACTOR = 'demo.EchoActor';

export interface IEchoActor {
    echo(value: string): Promise<string>;
}

class EchoActor implements IEchoActor {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    @action()
    public async echo(value: string): Promise<string> {
        return `${this.name} echoes: ${value}`;
    }
}

export function createEchoSuite(): IActorSuite {
    return new ActorSuite([
        {
            type: ECHO_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const name = context.id[0];
                return new EchoActor(name);
            }
        }
    ]);
}
