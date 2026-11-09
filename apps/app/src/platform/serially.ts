/**
Operations under one key run in order, each after the one before has settled: one session's
remote copy (poll and calendar use distinct keys), or a stored record read, changed and written
back, where two that overlap would each write what they read and lose the other's change
(bug-lessons 185). A failure answers its own caller and does not stop the next.
*/
const queues = new Map<string, Promise<unknown>>();

export const serially = async <T>(key: string, run: () => Promise<T>): Promise<T> => {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = (async () => {
    try {
      await previous;
    } catch {
      // The earlier one answered its own caller; the next still runs.
    }
    return await run();
  })();
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  }
};
