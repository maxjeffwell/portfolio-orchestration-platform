import { onAIEvent } from '../kafka/consumer.js';
import { eventBuffer } from '../kafka/eventBuffer.js';

export const aiEventResolvers = {
  Query: {
    recentAIEvents: () => eventBuffer.getAll(),
  },

  Subscription: {
    aiEventStream: {
      subscribe: async function* () {
        const queue = [];
        let resolve = null;

        const unsubscribe = onAIEvent((event) => {
          if (resolve) {
            const r = resolve;
            resolve = null;
            r(event);
          } else {
            queue.push(event);
          }
        });

        try {
          while (true) {
            const event = queue.length > 0
              ? queue.shift()
              : await new Promise((r) => { resolve = r; });

            yield { aiEventStream: event };
          }
        } finally {
          unsubscribe();
        }
      },
    },
  },
};
