import {
    action,
    deactivator,
    IActorRegistryActorInfo,
    IActorRegistryService,
    IActorRegistryService_Obtain_Request,
    IActorRegistryService_Obtain_Response,
    IActorRegistryService_Push_Request,
    IDeactivatable
} from '@darlean/base';
import { currentScope, PollController } from '@darlean/utils';
import * as uuid from 'uuid';

export class ActorRegistryService implements IActorRegistryService, IDeactivatable {
    protected byActorType: Map<string, IActorRegistryActorInfo>;
    protected pollController: PollController<boolean>;
    protected nonce: string;

    constructor() {
        this.byActorType = new Map();
        this.pollController = new PollController();
        this.nonce = uuid.v4();
    }

    // No locking because otherwise the long-polled obtain method would always block the deactivator
    @deactivator({ locking: 'none' })
    public async deactivate() {
        this.pollController.finalize();
    }

    @action({ locking: 'shared' })
    public async obtain(options: IActorRegistryService_Obtain_Request): Promise<IActorRegistryService_Obtain_Response> {
        // console.log('WITHIN OBTAIN', options.nonce, this.nonce, options.nonce === this.nonce);
        if (options.nonce === this.nonce) {
            if (!(await this.pollController.wait(20 * 1000))) {
                // console.log('RETURN');
                return {
                    nonce: this.nonce
                };
            }
            // console.log('RETURN TRUE');
        }

        const result: IActorRegistryService_Obtain_Response = {
            nonce: this.nonce,
            actorInfo: {}
        };

        const actorTypes = options.actorTypes ?? this.byActorType.keys();
        for (const actorType of actorTypes) {
            const info = this.byActorType.get(actorType);
            if (info && result.actorInfo) {
                result.actorInfo[actorType] = info;
            }
        }
        // console.log('RETURN RESULT', result)
        return result;
    }

    @action({ locking: 'shared' })
    public async push(options: IActorRegistryService_Push_Request): Promise<void> {
        currentScope().deep('Pushed options [Options]', () => ({
            Options: JSON.stringify(options)
        }));
        let changed = false;
        for (const [actorType, actorInfo] of Object.entries(options.actorInfo)) {
            let ourInfo = this.byActorType.get(actorType);
            if (!ourInfo) {
                ourInfo = {
                    applications: [],
                    placement: {}
                };
                this.byActorType.set(actorType, ourInfo);
                changed = true;
            }
            // TODO: Remove application when not hosting the actor type anymore
            const app = ourInfo.applications.find((x) => x.name === options.application);
            if (!app) {
                ourInfo.applications.push({ name: options.application, migrationVersion: actorInfo.migrationVersion });
                changed = true;
            } else {
                if (actorInfo.migrationVersion !== app.migrationVersion) {
                    app.migrationVersion = actorInfo.migrationVersion;
                }
            }

            // TODO: Use version number for replacement of placement
            if (actorInfo.placement.appBindIdx !== ourInfo.placement.appBindIdx) {
                ourInfo.placement.appBindIdx = actorInfo.placement.appBindIdx;
                changed = true;
            }

            if (actorInfo.placement.sticky !== ourInfo.placement.sticky) {
                ourInfo.placement.sticky = actorInfo.placement.sticky;
                changed = true;
            }
        }

        currentScope().deep('After push [Changed] [ActorTypes] [ActorInfos]', () => ({
            Changed: changed,
            ActorTypes: Array.from(this.byActorType.keys()),
            ActorInfos: JSON.stringify(Array.from(this.byActorType.values()))
        }));

        if (changed) {
            this.nonce = uuid.v4();
            this.pollController.interrupt(true);
        }
    }
}
