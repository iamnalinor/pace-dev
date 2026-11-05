import { err, ok, type Result } from "@pace/core";

import type { SessionStore } from "./session.ts";

type SessionPersistence = {
  readonly owner: () => number;
  readonly begin: () => number;
  readonly owns: (owner: number) => boolean;
  readonly invalidate: () => void;
  readonly resume: () => void;
  readonly suspend: () => Promise<void>;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly save: (
    token: string,
    owner: number,
    publish: () => void,
  ) => Promise<Result<undefined, "session/changed">>;
};

const clearOwnedToken = async (store: SessionStore, token: string): Promise<void> => {
  if (Object.is(await store.get(), token)) {
    await store.clear();
  }
};

const noop = (): void => undefined;

/** Serializes writes with handoff clears; generation ownership fences their publication. */
export const sessionPersistence = (
  store: SessionStore,
  canSignIn: () => boolean,
): SessionPersistence => {
  let generation = 0;
  let isEnabled = true;
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let finish = noop;
    tail = new Promise<void>((resolve) => {
      finish = resolve;
    });
    try {
      await previous;
      return await operation();
    } finally {
      finish();
    }
  };
  const isOwner = (owner: number): boolean => isEnabled && canSignIn() && owner === generation;
  return {
    owner: () => generation,
    begin: () => {
      generation += 1;
      return generation;
    },
    owns: isOwner,
    invalidate: (): void => {
      generation += 1;
    },
    resume: (): void => {
      isEnabled = true;
    },
    suspend: async (): Promise<void> => {
      isEnabled = false;
      generation += 1;
      // The queued clear follows every already-started save, including failed ones.
      await serialize(store.clear);
    },
    serialize,
    save: async (
      token: string,
      owner: number,
      publish: () => void,
    ): Promise<Result<undefined, "session/changed">> =>
      await serialize(async () => {
        if (!isOwner(owner)) {
          return err("session/changed");
        }
        await store.set(token);
        if (!isOwner(owner)) {
          // This write still owns the queue, so a later local save cannot be erased here.
          await clearOwnedToken(store, token);
          return err("session/changed");
        }
        publish();
        return ok(undefined);
      }),
  };
};
