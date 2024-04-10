// src/echo-suite/index.ts:

import { ActorSuite } from "@darlean/base";
import { EchoActor, IEchoActorState } from "./echo-actor";
import { EchoService } from "./echo-service";

export const ECHO_SERVICE = 'EchoService';
export interface IEchoService extends EchoService {}

const ECHO_ACTOR = 'EchoActor';

export function createEchoSuite() {
    return new ActorSuite([
        {
            type: ECHO_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const persistence = context.persistence<IEchoActorState>().persistable();
                const name = context.id[0];
                return new EchoActor(persistence, name);
            }
        },
        {
            type: ECHO_SERVICE,
            kind: 'multiplar',
            creator: (context) => {
                const portal = context.portal.typed<EchoActor>(ECHO_ACTOR);
                return new EchoService(portal);
            }
        }
    ]);
}