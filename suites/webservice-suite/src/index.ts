/**
 * Suite that provides the WebService service that makes it possible to handle HTTP requests with actors.
 *
 * @packageDocumentation
 */

import { ActorSuite, IStartAction } from '@darlean/base';
import { fetchConfigNumber } from '@darlean/utils';
import { IHandler, IHost, WebServiceHostActor } from './actor.impl';
import { IWebServiceCfg } from './intf';

export const WEBSERVICE_HOST_ACTOR = 'io.darlean.WebServiceHostActor';
export * from './actor.impl';
export * from './intf';

export default function suite(config: IWebServiceCfg, appId: string) {
    const startActions: IStartAction[] = [];
    for (const host of config.hosts ?? []) {
        startActions.push({ name: `Webservice ${host.id ?? 'default'}`, id: [host.id ?? 'default', appId], action: 'touch' });
    }

    return new ActorSuite([
        {
            type: WEBSERVICE_HOST_ACTOR,
            kind: 'singular',
            placement: {
                version: '20230202',
                bindIdx: -1
            },
            creator: (context) => {
                const id = context.id[0];
                const hostcfg = config.hosts?.find((x) => x.id === id);
                if (hostcfg) {
                    const cfg: IHost = {
                        name: hostcfg.id ?? 'default',
                        port: fetchConfigNumber('DARLEAN_WEBSERVICE_PORT', '--darlean-webservice-port') ?? hostcfg.port ?? 80,
                        handlers: []
                    };
                    for (const handler of hostcfg.handlers ?? []) {
                        const actorType = handler.actorType ?? hostcfg.actorType;
                        if (!actorType) {
                            throw new Error(`No actor type configured for WebService handler`);
                        }
                        const actionName = handler.actionName;
                        if (!actionName) {
                            throw new Error('No action name configured for WebService handler');
                        }
                        const actorId = handler.actorId ?? hostcfg.actorId ?? [];

                        const h: IHandler = {
                            method: handler.method,
                            path: handler.path,
                            action: async (req) => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const actor = context.portal.retrieve(actorType, actorId) as any;
                                return await actor[actionName](req);
                            }
                        };
                        cfg.handlers?.push(h);
                    }
                    return new WebServiceHostActor(cfg);
                } else throw new Error(`Host [${id}] is not configured`);
            },
            startActions
        }
    ]);
}
