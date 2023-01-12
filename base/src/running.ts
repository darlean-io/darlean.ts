import { ITime } from '@darlean/utils';
import { IInstanceContainer } from './instances';
import { IActorPlacement, IPortal } from './remoteinvocation';
import { IPersistence, IVolatileTimer } from './various';

export interface IActorRegistrationOptions<T extends object> {
    type: string;
    kind: 'singular' | 'multiplar';
    // Creator function that creates a new actor instance. Can be optional, because client applications may just register an actor
    // to specify the hosts property without being able to create new instances themselves.
    creator?: (context: IActorCreateContext) => T;
    container?: IInstanceContainer<T>;
    capacity?: number;
    placement?: IActorPlacement;

    /**
     * When present, the list of hosts on which this actor can run.
     */
    hosts?: string[];
}

export interface IActorCreateContext {
    id: string[];
    persistence: IPersistence<unknown>;
    portal: IPortal;
    time: ITime;
    newVolatileTimer(): IVolatileTimer;
}

export interface IActorSuite {
    getRegistrationOptions(): IActorRegistrationOptions<object>[];
}

export class ActorSuite implements IActorSuite {
    protected options: IActorRegistrationOptions<object>[];

    constructor(actors: IActorRegistrationOptions<object>[] = []) {
        this.options = [];

        for (const item of actors) {
            this.addActor(item);
        }
    }

    public addActor(options: IActorRegistrationOptions<object>) {
        this.options.push(options);
    }

    public addSuite(suite: IActorSuite) {
        for (const options of suite.getRegistrationOptions()) {
            this.addActor(options);
        }
    }

    public getRegistrationOptions(): IActorRegistrationOptions<object>[] {
        return this.options;
    }

    protected addItem(item: ActorOrSuite) {
        if (item.actor) {
            this.addActor(item.actor);
        }

        if (item.suite) {
            this.addSuite(item.suite);
        }
    }
}

export interface ActorOrSuite {
    actor?: IActorRegistrationOptions<object>;
    suite?: IActorSuite;
}
