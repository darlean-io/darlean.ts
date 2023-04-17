/**
 * Suite that provides the WebGateways service that makes it possible to handle HTTP requests with actors.
 *
 * @packageDocumentation
 */

import { ActorSuite, IStartAction } from '@darlean/base';
import { IConfigEnv } from '@darlean/utils';
import { IHandler, IGateway, WebGatewayActor } from './actor.impl';
import { IWebGatewaysCfg } from './intf';

export const WEBGATEWAY_HOST_ACTOR = 'io.darlean.WebGatewayHostActor';
export * from './actor.impl';
export * from './intf';

export function createWebGatewaysSuite(config: IWebGatewaysCfg, appId: string) {
    const startActions: IStartAction[] = [];
    for (const host of config.gateways ?? []) {
        startActions.push({ name: `Web Gateway ${host.id ?? 'default'}`, id: [host.id ?? 'default', appId], action: 'touch' });
    }

    return new ActorSuite([
        {
            type: WEBGATEWAY_HOST_ACTOR,
            kind: 'singular',
            placement: {
                version: '20230202',
                bindIdx: -1
            },
            creator: (context) => {
                const id = context.id[0];
                const gatewaycfg = config.gateways?.find((x) => x.id === id);
                if (gatewaycfg) {
                    const cfg: IGateway = {
                        name: gatewaycfg.id ?? 'default',
                        port: gatewaycfg.port ?? 80,
                        handlers: []
                    };
                    for (const handler of gatewaycfg.handlers ?? []) {
                        const actorType = handler.actorType ?? gatewaycfg.actorType;
                        const actionName = handler.actionName;
                        if (!handler.flow) {
                            if (!actorType) {
                                throw new Error(`No actor type configured for Web Gateway handler`);
                            }
                            if (!actionName) {
                                throw new Error('No action name configured for WebGateway handler');
                            }
                        }
                        const actorId = handler.actorId ?? gatewaycfg.actorId ?? [];

                        const h: IHandler = {
                            method: handler.method,
                            path: handler.path,
                            action: async (req) => {
                                if (actorType && actionName) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const actor = context.portal.retrieve(actorType, actorId) as any;
                                    return await actor[actionName](req);
                                }
                            },
                            flow: handler.flow
                        };
                        cfg.handlers?.push(h);
                    }
                    return new WebGatewayActor(cfg);
                } else throw new Error(`Host [${id}] is not configured`);
            },
            startActions
        }
    ]);
}

export function createWebGatewaysSuiteFromConfig(config: IConfigEnv<IWebGatewaysCfg>, runtimeEnabled: boolean, appId: string) {
    if (config.fetchBoolean('enabled') ?? runtimeEnabled) {
        const options: IWebGatewaysCfg = {
            gateways: []
        };

        const gateways = config.fetchRaw('gateways');

        let first = true;
        for (const gateway of gateways ?? []) {
            const port = first ? config.fetchNumber('port') ?? gateway.port : gateway.port;
            options.gateways?.push({
                id: gateway.id,
                port,
                actorId: gateway.actorId,
                actorType: gateway.actorType,
                handlers: gateway.handlers
            });

            first = false;
        }

        return createWebGatewaysSuite(options, appId);
    }
}
