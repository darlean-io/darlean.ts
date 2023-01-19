import { IActorRegistryService, IActorRegistryService_Push_Request } from '@darlean/actor-registry-suite';
import { IAbortable } from '@darlean/base';
import { Aborter, ITime, ITimer } from '@darlean/utils';
import { ActorRegistry, IActorRegistry, IActorTypeInfo } from './remoteinvocation';
import { normalizeActorType } from './shared';

/**
 * Implementation of {@link IActorRegistry} that uses the distributed actor registry functionality
 * from {@link @darlean/actor-registry-suite}.
 */
export class DistributedActorRegistry implements IActorRegistry {
    private service: IActorRegistryService & IAbortable;
    private ownRegistry: ActorRegistry;
    private knownRegistry: ActorRegistry;
    private requestedTypes: string[];
    private refreshTimer?: ITimer;
    private pushTimer?: ITimer;
    private appId: string;
    private time: ITime;
    private nonce: string;
    private aborter?: Aborter;

    constructor(service: IActorRegistryService & IAbortable, time: ITime, appId: string, ownRegistry: ActorRegistry) {
        this.service = service;
        this.ownRegistry = ownRegistry;
        this.knownRegistry = new ActorRegistry();
        this.requestedTypes = [];
        this.appId = appId;
        this.time = time;
        this.nonce = '';
    }

    public start() {
        // Note: the obtain action is a long-polling operation that returns when
        // the data is changed, or after a certain timeout. That is why we
        // set the interval here to 0, to perform an immediate retry after the
        // poll expired.
        this.refreshTimer = this.time.repeat(
            async () => {
                await this.obtain();
            },
            'Actor registry refresh',
            0,
            0
        );

        this.pushTimer = this.time.repeat(
            async () => {
                await this.push();
            },
            'Actor registry push',
            30 * 1000,
            0
        );
    }

    public stop() {
        if (this.refreshTimer) {
            this.refreshTimer.cancel();
            this.refreshTimer = undefined;
        }

        if (this.pushTimer) {
            this.pushTimer.cancel();
            this.pushTimer = undefined;
        }

        //console.log('INTERRUPTING');
        if (this.aborter) {
            this.aborter.abort();
        }
    }

    public findPlacement(type: string): IActorTypeInfo | undefined {
        type = normalizeActorType(type);
        const placement = this.knownRegistry.findPlacement(type);
        if (!placement) {
            if (!this.requestedTypes.includes(type)) {
                this.requestedTypes.push(type);
            }
            return this.ownRegistry.findPlacement(type);
        }
        return placement;
    }

    protected async obtain() {
        //console.log('OBTAINING', this.nonce, this.requestedTypes);

        try {
            this.aborter = new Aborter();
            this.service.aborter(this.aborter);

            // We deliberately do not provide our list of requested actor types to the actorTypes field, because that would
            // require on our side that as soon as we receive requests for new actor types, we have to abort the current
            // obtain request and issue a new one. This is complicated logic that we would like to avoid for the time being.
            // So, always ask for all actors the distributed registry is aware of, and as soon as the distributed registry becomes
            // aware of new actors, it will stop the long-poll and return us the information.
            const info = await this.service.obtain({
                nonce: this.nonce,
                actorTypes: undefined
            });

            this.nonce = info.nonce;

            //console.log('OBTAINED', JSON.stringify(info));
            for (const [type, typeinfo] of Object.entries(info.actorInfo ?? {})) {
                for (const application of typeinfo.applications) {
                    this.knownRegistry.addMapping(type, application.name, {
                        version: '',
                        bindIdx: typeinfo.placement.appBindIdx,
                        sticky: typeinfo.placement.sticky
                    });
                }
            }
        } catch (e) {
            this.refreshTimer?.pause(5 * 1000);
            throw e;
        }
    }

    protected async push() {
        const request: IActorRegistryService_Push_Request = {
            application: this.appId,
            actorInfo: {}
        };

        for (const [actorType, info] of this.ownRegistry.getAll().entries()) {
            if (info.destinations.includes(this.appId)) {
                request.actorInfo[actorType] = {
                    placement: {
                        appBindIdx: info.placement?.bindIdx,
                        sticky: info.placement?.sticky
                    }
                };
            }
        }

        // console.log('PUSHING', JSON.stringify(request));

        await this.service.push(request);
    }
}
