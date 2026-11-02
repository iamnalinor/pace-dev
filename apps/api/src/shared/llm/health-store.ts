import type { LlmHealth } from "./health-object.ts";

import { createLogger } from "../logger.ts";
import { logChanges } from "./health-keeper.ts";
import { type Health, nextHealth, type Verdict } from "./health.ts";

const log = createLogger("info");

/** Where the providers' health is kept: read before a read, told what the read showed after it. */
export type HealthMemory = {
  readonly read: () => Promise<Health>;
  readonly record: (verdicts: readonly Verdict[], now: string) => Promise<void>;
};

/** A memory inside this object only: tests, and anything that needs no sharing. */
export const memoryHealth = (initial: Health = {}): HealthMemory => {
  let health = initial;
  return {
    read: async () => {
      await Promise.resolve();
      return health;
    },
    record: async (verdicts, now) => {
      const next = nextHealth(health, verdicts, now);
      health = next.health;
      logChanges(next.changes);
      await Promise.resolve();
    },
  };
};

/** How long an isolate trusts what it last read, so a hot path does not ask the object every message. */
export const HEALTH_CACHE_MS = 15_000;

/** The deployment's one health object. */
const OBJECT_NAME = "global";

/** What an isolate last read or saved, and when (its own clock). */
export type HealthCache = { value?: { readonly health: Health; readonly at: number } };

/** This isolate's cache: one per isolate, as a deployment has one health object. */
const ISOLATE_CACHE: HealthCache = {};

type ObjectHealthOptions = {
  readonly cache?: HealthCache;
  /** The isolate's clock for the cache (not the read's `now`, which a drain holds still). */
  readonly clock?: () => number;
};

/**
The health shared by every user and isolate, kept by its own Durable Object (`LlmHealth`):
one writer, so records sent at once all count and nothing an edge cache held comes back.
Reads are cached for `HEALTH_CACHE_MS`; a read's verdicts go to the object only when they
change a record as this isolate sees it, and the object writes its storage only when who is
asked first changes. When the object cannot be reached the read goes ahead in the configured
order and the failure is logged as an error; a state the object did not save is never cached.
*/
export const objectHealth = (
  namespace: DurableObjectNamespace<LlmHealth>,
  options: ObjectHealthOptions = {},
): HealthMemory => {
  const { cache = ISOLATE_CACHE, clock = Date.now } = options;
  const object = () => namespace.get(namespace.idFromName(OBJECT_NAME));
  const remember = (health: Health): Health => {
    cache.value = { at: clock(), health };
    return health;
  };
  const read = async (): Promise<Health> => {
    const cached = cache.value;
    if (cached !== undefined && clock() - cached.at < HEALTH_CACHE_MS) {
      return cached.health;
    }
    try {
      return remember(await object().read());
    } catch (error) {
      log.error("llm: provider health not read; asking in the configured order", {
        why: String(error),
      });
      return {};
    }
  };
  return {
    read,
    record: async (verdicts, now) => {
      if (nextHealth(await read(), verdicts, now).changes.length === 0) {
        return;
      }
      try {
        remember(await object().record(verdicts, now));
      } catch (error) {
        log.error("llm: provider health not saved", { why: String(error) });
      }
    },
  };
};

/**
`memory` with its records handed to `waitUntil`: they run after the response, so a person (or
Telegram's webhook) never waits on bookkeeping. The memory logs its own failures.
*/
export const inBackground = (
  memory: HealthMemory,
  waitUntil: (promise: Promise<unknown>) => void,
): HealthMemory => ({
  read: memory.read,
  record: async (verdicts, now) => {
    waitUntil(memory.record(verdicts, now));
    await Promise.resolve();
  },
});

/** The deployment's health memory, from the bindings of this request or Durable Object. */
export const llmHealthOf = (env: {
  readonly LLM_HEALTH: DurableObjectNamespace<LlmHealth>;
}): HealthMemory => objectHealth(env.LLM_HEALTH);

/** The deployment's health memory for a request: what its read showed is saved after the response. */
export const llmHealthAfterResponse = (
  env: { readonly LLM_HEALTH: DurableObjectNamespace<LlmHealth> },
  ctx: Pick<ExecutionContext, "waitUntil">,
): HealthMemory =>
  inBackground(llmHealthOf(env), (promise) => {
    ctx.waitUntil(promise);
  });
