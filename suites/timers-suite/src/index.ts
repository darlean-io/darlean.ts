/**
 * Suite that provides the Timers Service.
 *
 * @packageDocumentation
 */

import { ActorSuite, TIMERS_SERVICE } from '@darlean/base';
import { encodeNumber, ITimer } from '@darlean/utils';
import { ITimerState, TimerActor, TIMER_MOMENT_INDEX } from './timers';

export * from './timers';

export function createTimersSuite() {
    let timerHandle: ITimer | undefined;

    return new ActorSuite([
        {
            type: TIMERS_SERVICE,
            kind: 'singular',
            startHandlers: [
                {
                    name: 'Start timers',
                    handler: async (portal, time) => {
                        const actor = portal.retrieve<TimerActor>(TIMERS_SERVICE, []);
                        timerHandle = time.repeat(
                            async () => {
                                try {
                                    await actor.touch();
                                } catch (e) {
                                    // What to do with it?
                                }
                            },
                            'TimerHammer',
                            60 * 1000,
                            0
                        );
                    }
                }
            ],
            stopHandlers: [
                {
                    name: 'Stop timers',
                    handler: async () => {
                        if (timerHandle) {
                            const th = timerHandle;
                            timerHandle = undefined;
                            await th.cancel();
                        }
                    }
                }
            ],
            creator: (context) => {
                const tablePersistence = context.tablePersistence<ITimerState>({
                    specifier: 'io.darlean.timers',
                    id: [],
                    scope: 'actor',
                    indexer: (d) => [{ name: TIMER_MOMENT_INDEX, keys: [encodeNumber(d.nextMoment)] }]
                });

                return new TimerActor(tablePersistence, context.time, context.newVolatileTimer(), context.portal);
            }
        }
    ]);
}
