import { z } from "zod";

import { createLogger } from "../logger.ts";
import {
  type Health,
  HEALTH_REASONS,
  type HealthChange,
  nextHealth,
  type Verdict,
} from "./health.ts";

const log = createLogger("info");

/** The part of a Durable Object's storage the keeper uses. */
export type KeeperStorage = Pick<DurableObjectStorage, "delete" | "get" | "put">;

const HEALTH_KEY = "health";

const HealthSchema = z.record(
  z.string(),
  z.object({
    reason: z.enum(HEALTH_REASONS),
    strikes: z.number().int().min(1),
    until: z.string().nullable(),
  }),
);

/** The one log line per change of order: a provider moved last, or back in its place. */
const logChange = (change: HealthChange): void => {
  switch (change.kind) {
    case "moved-last": {
      log.warn("llm: provider asked last", {
        provider: change.provider,
        strikes: change.strikes,
        until: change.until,
        why: change.reason,
      });
      return;
    }
    case "recovered": {
      log.info("llm: provider back in its place", { provider: change.provider });
      return;
    }
    case "returned": {
      log.info("llm: provider back in its place, its probe unjudged", {
        provider: change.provider,
      });
      return;
    }
    case "noted": {
      // A first slow answer changes no order: nothing to tell.
      return;
    }
  }
};

export const logChanges = (changes: readonly HealthChange[]): void => {
  for (const change of changes) {
    logChange(change);
  }
};

/**
What outlives the object: the records that move a provider (a penalty running, or over and
waiting for its probe). A first slow answer and a probe put back change no order: memory only.
*/
const keptOf = (health: Health): Health =>
  Object.fromEntries(Object.entries(health).filter(([, entry]) => entry.until !== null));

export type HealthKeeper = {
  readonly read: () => Promise<Health>;
  /**
  Applies a read's verdicts, one record after another (none lost to another's), and writes
  storage only when what outlives the object changed. A storage failure rejects and leaves the
  state as it was.
  */
  readonly record: (
    verdicts: readonly Verdict[],
    now: string,
  ) => Promise<{ readonly health: Health; readonly changes: readonly HealthChange[] }>;
};

/** The providers' health kept by its one writer, the `LlmHealth` Durable Object. */
export const createHealthKeeper = (storage: KeeperStorage): HealthKeeper => {
  let loaded: undefined | { health: Health; stored: string };
  // The record before this one: each waits for it, so none builds on a state about to change.
  let previous: Promise<unknown> = Promise.resolve();
  const load = async (): Promise<{ health: Health; stored: string }> => {
    if (loaded === undefined) {
      const health = HealthSchema.safeParse(await storage.get(HEALTH_KEY)).data ?? {};
      loaded = { health, stored: JSON.stringify(keptOf(health)) };
    }
    return loaded;
  };
  const apply = async (verdicts: readonly Verdict[], now: string) => {
    const current = await load();
    const next = nextHealth(current.health, verdicts, now);
    const kept = keptOf(next.health);
    const stored = JSON.stringify(kept);
    if (stored !== current.stored) {
      await (Object.keys(kept).length === 0
        ? storage.delete(HEALTH_KEY)
        : storage.put(HEALTH_KEY, kept));
    }
    loaded = { health: next.health, stored };
    logChanges(next.changes);
    return next;
  };
  return {
    read: async () => {
      const { health } = await load();
      return health;
    },
    record: async (verdicts, now) => {
      const before = previous;
      const done = Promise.withResolvers<undefined>();
      previous = done.promise;
      try {
        await before;
        return await apply(verdicts, now);
      } finally {
        done.resolve(undefined);
      }
    },
  };
};
