import { ActorSuite, IActorSuite } from '@darlean/base';
import { Knowledge, OracleActor } from './oracle.actor';
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
export function createOracleSuite(knowledge?: IKnowledgeTopics): IActorSuite {
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
                // Create persistence interface. The specifier must match with the one of the `runtime.peristence.specifiers`
                // filters in the configuration file.
                const p = context.persistence<Knowledge>('oracle.fact.knowledge');
                // Derive a persistable instance with the provided default knowledge
                const persistable = p.persistable(['knowledge'], undefined, k ?? {});
                // Create a reference to the controller (when we are a follower -- which is when our id contains more than 1 part)
                const controller =
                    context.id.length > 1 ? context.portal.retrieve<IOracleActor>(ORACLE_ACTOR, [context.id[0]]) : undefined;
                // Create the refresh timer that the follower actor uses to refresh its data from the controller
                const timer = context.newVolatileTimer();
                // Create and return a new OracleActor instance with the provided persistable and controller
                return new OracleActor(persistable, controller, timer);
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
