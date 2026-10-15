/** Operations on one session's remote copy run in order (poll and calendar use distinct keys). */
const queues = new Map<string, Promise<unknown>>();

export const seriallyBySession = async <T>(session: string, run: () => Promise<T>): Promise<T> => {
  const previous = queues.get(session) ?? Promise.resolve();
  const next = (async () => {
    try {
      await previous;
    } catch {
      // The earlier poll answered its own caller; the next still checks the queue.
    }
    return await run();
  })();
  queues.set(session, next);
  try {
    return await next;
  } finally {
    if (queues.get(session) === next) {
      queues.delete(session);
    }
  }
};
