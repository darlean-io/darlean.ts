import { ActorSuite, IActorSuite } from '@darlean/base';
import { OracleControllerActor } from './oracle.actor.controller';
import { OracleFollowerActor } from './oracle.actor.follower';
import { IOracleControllerActor, IOracleFollowerActor, Knowledge, ORACLE_SERVICE } from './oracle.intf';
import { OracleService } from './oracle.service';

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

const ORACLE_CONTROLLER_ACTOR = 'OracleControllerActor';
const ORACLE_FOLLOWER_ACTOR = 'OracleFollowerActor';

// Application code can invoke this suite function to register the oracle actors
// (OracleService and OracleActor) to their actor runner.
export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        // Registration of the OracleReadActor virtual follower actor
        {
            type: ORACLE_FOLLOWER_ACTOR,
            // Singular: there is only one actor instance active at any moment for the same actor type and id
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Create a reference to our controller
                const controller = context.portal.retrieve<IOracleControllerActor>(ORACLE_CONTROLLER_ACTOR, [topic]);
                // Create the refresh timer that the follower actor uses to refresh its data from the controller
                const timer = context.newVolatileTimer();
                // Create and return a new OracleActor instance with the provided persistence, controller and knowledge
                return new OracleFollowerActor(controller, timer);
            }
        },
        // Registration of the OracleReadActor virtual controller actor
        {
            type: ORACLE_CONTROLLER_ACTOR,
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
                // Create and return a new OracleControlActor instance with the provided persistence and knowledge
                return new OracleControllerActor(p, k);
            }
        },
        // Registration of the OracleService service actor
        {
            type: ORACLE_SERVICE,
            // Multiplar: there can be more than one actor instance active at any moment for the same actor type and id
            kind: 'multiplar',
            creator: (context) => {
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor controller instances
                const controlPortal = context.portal.typed<IOracleControllerActor>(ORACLE_CONTROLLER_ACTOR);
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor follower instances
                const followerPortal = context.portal.typed<IOracleFollowerActor>(ORACLE_FOLLOWER_ACTOR);
                // Create and return a new OracleService with the typed portals
                return new OracleService(controlPortal, followerPortal);
            }
        }
    ]);
}
