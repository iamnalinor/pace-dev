/**
One top-level actor call owns its state through external awaits. A failed call releases the
next one; internal calls on the service bypass this gate, so they cannot wait on themselves.
*/
export const actorCalls = (): (<T>(call: () => Promise<T> | T) => Promise<T>) => {
  let previous: Promise<unknown> = Promise.resolve(undefined);
  return async (call) => {
    const before = previous;
    const done = Promise.withResolvers<undefined>();
    previous = done.promise;
    try {
      await before;
      return await call();
    } finally {
      done.resolve(undefined);
    }
  };
};
