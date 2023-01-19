import { ActorSuite, IActorSuite } from '@darlean/base';
import { OracleActor } from './oracle.actor';
import { IOracleActor, ORACLE_SERVICE } from './oracle.intf';
import { OracleService } from './oracle.service';

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

const ORACLE_ACTOR = 'OracleActor';

// Application code can invoke this suite function to register the oracle actors
// (OracleService and OracleActor) to their actor runner.
export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        // Registration of the OracleActor virtual actor
        {
            type: ORACLE_ACTOR,
            // Singular: there is only one actor instance active at any moment for the same actor type and id
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Lookup relevant facts for the topic in the knowledge
                const k = topic ? knowledge?.[topic] : undefined;
                // Create and return a new OracleActor instance with the provided knowledge
                return new OracleActor(k);
            }
        },
        // Registration of the OracleService service actor
        {
            type: ORACLE_SERVICE,
            // Multiplar: there can be more than one actor instance active at any moment for the same actor type and id
            kind: 'multiplar',
            creator: (context) => {
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor instances
                const actorPortal = context.portal.typed<IOracleActor>(ORACLE_ACTOR);
                // Create and return a new OracleService with the typed portal
                return new OracleService(actorPortal);
            }
        }
    ]);
}
