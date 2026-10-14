import { type FakeRoute, problem } from "@pace/client/testing";

/** A fake API route whose calls wait until the test answers or refuses them, oldest first. */
export type HeldRoute = {
  readonly route: FakeRoute;
  /** The bodies it was called with, in order. */
  readonly calls: readonly unknown[];
  /** How many calls wait for an answer. */
  readonly waiting: () => number;
  /** Answers the oldest waiting call with `body`. */
  readonly answer: (body: unknown) => void;
  /** Refuses the oldest waiting call, as a server that cannot be reached right now would. */
  readonly refuse: (status?: number) => void;
};

/**
A route held pending (bug class 3, transient UI state cleared before the store catches up): the
screen is asserted while the action waits, then after it is answered, and after it is refused.
An action that resolves at once hides every bug of this class.
*/
export const heldRoute = (): HeldRoute => {
  const calls: unknown[] = [];
  const held: PromiseWithResolvers<unknown>[] = [];
  return {
    answer: (body) => {
      held.shift()?.resolve(body);
    },
    calls,
    refuse: (status = 503) => {
      held.shift()?.resolve(problem(status, "unavailable"));
    },
    route: async ({ body }) => {
      calls.push(body);
      const call = Promise.withResolvers<unknown>();
      held.push(call);
      return await call.promise;
    },
    waiting: () => held.length,
  };
};
