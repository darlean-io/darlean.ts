import { ActorSuite, IActorSuite } from '@darlean/base';
import { OracleControllerActor } from './oracle.actor.controller';
import { OracleReaderActor } from './oracle.actor.reader';
import { IOracleControllerActor, IOracleReaderActor, Knowledge, ORACLE_SERVICE } from './oracle.intf';
import { OracleService } from './oracle.service';

export interface IKnowledgeFacts {
    [fact: string]: number;
}

export interface IKnowledgeTopics {
    [topic: string]: IKnowledgeFacts;
}

const ORACLE_CONTROLLER_ACTOR = 'OracleControllerActor';
const ORACLE_READER_ACTOR = 'OracleReaderActor';

// Application code can invoke this suite function to register the oracle actors
// (OracleService and OracleActor) to their actor runner.
export default function suite(knowledge?: IKnowledgeTopics): IActorSuite {
    return new ActorSuite([
        // Registration of the OracleReadActor virtual reader actor
        {
            type: ORACLE_READER_ACTOR,
            // Singular: there is only one actor instance active at any moment for the same actor type and id
            kind: 'singular',
            // Factory function that creates a new actor instance
            creator: (context) => {
                // Derive the topic from the current actor id. We use the first (and only) id field as topic name.
                const topic = context.id[0];
                // Create a reference to the controller (when we are a reader -- which is when our id contains more than 1 part)
                const controller = context.portal.retrieve<IOracleControllerActor>(ORACLE_CONTROLLER_ACTOR, [topic]);
                // Create the refresh timer that the reader actor uses to refresh its data from the controller
                const timer = context.newVolatileTimer();
                // Create and return a new OracleActor instance with the provided persistence, controller and knowledge
                return new OracleReaderActor(controller, timer);
            }
        },
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
                // Obtain a typed portal that the service can use to retrieve proxies to specific OracleActor instances
                const controlPortal = context.portal.typed<IOracleControllerActor>(ORACLE_CONTROLLER_ACTOR);
                const readerPortal = context.portal.typed<IOracleReaderActor>(ORACLE_READER_ACTOR);
                // Create and return a new OracleService with the typed portal
                return new OracleService(controlPortal, readerPortal);
            }
        }
    ]);
}
