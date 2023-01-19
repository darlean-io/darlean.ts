import { ActorSuite, IActorSuite } from "@darlean/base";
import { OracleActor } from "./oracle.actor";
import { ORACLE_ACTOR } from "./oracle.intf";

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        {
            type: ORACLE_ACTOR,
            kind: 'singular',
            creator: (context) => {
                const topic = context.id[0];
                const k = topic ? knowledge?.[topic] : undefined;
                return new OracleActor(k);
            }
        }
    ]);
}
