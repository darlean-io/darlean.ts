/**
 * Suite that provides the Timers Service.
 *
 * @packageDocumentation
 */

import { ActorSuite } from '@darlean/base';
import { encodeNumber } from '@darlean/utils';
import { ITimerState, TimerActor, TIMER_MOMENT_INDEX } from './timers';

export * from './timers';

export const TIMERS_SERVICE = 'io.darlean.TimersService';

export function createTimersSuite() {
    return new ActorSuite([
        {
            type: TIMERS_SERVICE,
            kind: 'singular',
            creator: (context) => {
                const tablePersistence = context.tablePersistence<ITimerState>({
                    specifier: 'io.darlean.timers',
                    indexer: (d) => [
                        { name: TIMER_MOMENT_INDEX, keys: [encodeNumber(d.nextMoment)]}
                    ]
                });
            
                return new TimerActor(tablePersistence, context.time, context.newVolatileTimer());
            }
        }
    ]);
}
