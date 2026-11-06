import type { HealthActor } from "../ports/bindings.ts";

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

/**
How long a read of the object may take: it sits on the parse and the bot's path (a 7 s budget), so
an object that does not answer is given up on and the read goes ahead in the configured order
(round 7 review 3).
*/
export const HEALTH_READ_TIMEOUT_MS = 1000;

/**
How long an isolate goes on without the object after a read failed or timed out, so every message
in the meantime does not wait its second for it again; far shorter than a good read's window.
*/
export const HEALTH_FAILURE_CACHE_MS = 5000;

/** The deployment's one health object. */

/** What an isolate last read or saved, and when (its own clock). */
export type HealthCache = {
  value?: { readonly health: Health; readonly at: number; readonly ttl: number };
};

/** This isolate's cache: one per isolate, as a deployment has one health object. */
const ISOLATE_CACHE: HealthCache = {};

type ObjectHealthOptions = {
  readonly cache?: HealthCache;
  /** The isolate's clock for the cache (not the read's `now`, which a drain holds still). */
  readonly clock?: () => number;
  readonly readTimeoutMs?: number;
};

/** The object's answer, or a refusal once `ms` passed without one. */
const withinMs = async <T>(ms: number, call: () => Promise<T>): Promise<T> => {
  const timer: { id?: ReturnType<typeof setTimeout> } = {};
  try {
    return await Promise.race([
      call(),
      new Promise<never>((_resolve, reject) => {
        timer.id = setTimeout(() => {
          reject(new Error(`no answer in ${String(ms)} ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer.id);
  }
};

/**
The health shared by every user and isolate, kept by its own Durable Object (`LlmHealth`):
one writer, so records sent at once all count and nothing an edge cache held comes back.
Reads are cached for `HEALTH_CACHE_MS`; a read's verdicts go to the object only when they
change a record as this isolate sees it, and the object writes its storage only when who is
asked first changes. When the object cannot be reached, or does not answer within
`HEALTH_READ_TIMEOUT_MS`, the read goes ahead in the configured order, the failure is logged as
an error and the empty health is kept for `HEALTH_FAILURE_CACHE_MS`; a state the object did not
save is never cached.
*/
export const objectHealth = (
  object: () => HealthActor,
  options: ObjectHealthOptions = {},
): HealthMemory => {
  const {
    cache = ISOLATE_CACHE,
    clock = Date.now,
    readTimeoutMs = HEALTH_READ_TIMEOUT_MS,
  } = options;
  const remember = (health: Health, ttl = HEALTH_CACHE_MS): Health => {
    cache.value = { at: clock(), health, ttl };
    return health;
  };
  const read = async (): Promise<Health> => {
    const cached = cache.value;
    if (cached !== undefined && clock() - cached.at < cached.ttl) {
      return cached.health;
    }
    try {
      return remember(await withinMs(readTimeoutMs, async () => await object().read()));
    } catch (error) {
      log.error("llm: provider health not read; asking in the configured order", {
        why: String(error),
      });
      return remember({}, HEALTH_FAILURE_CACHE_MS);
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
export const llmHealthOf = (env: { readonly LLM_HEALTH: HealthMemory }): HealthMemory =>
  env.LLM_HEALTH;

/** The deployment's health memory for a request: what its read showed is saved after the response. */
export const llmHealthAfterResponse = (
  env: { readonly LLM_HEALTH: HealthMemory },
  ctx: { readonly waitUntil: (promise: Promise<unknown>) => void },
): HealthMemory =>
  inBackground(llmHealthOf(env), (promise) => {
    ctx.waitUntil(promise);
  });
