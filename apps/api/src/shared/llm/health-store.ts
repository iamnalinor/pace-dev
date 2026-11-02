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

/** Where the providers' health is kept: read before a read, told what the read showed after it. */
export type HealthMemory = {
  readonly read: () => Promise<Health>;
  readonly record: (verdicts: readonly Verdict[], now: string) => Promise<void>;
};

/** The one log line per change of order: a provider moved last, or back in its place. */
const logChanges = (changes: readonly HealthChange[]): void => {
  for (const change of changes) {
    if (change.kind === "moved-last") {
      log.warn("llm: provider asked last", {
        provider: change.provider,
        strikes: change.strikes,
        until: change.until,
        why: change.reason,
      });
    } else if (change.kind === "recovered") {
      log.info("llm: provider back in its place", { provider: change.provider });
    }
  }
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

/** The KV key, in the deployment's one namespace (`OAUTH_KV`; the OAuth keys are `client:`, `grant:`, `token:`). */
export const HEALTH_KEY = "llm:health";
/** A record nobody touched for a day is dropped by KV itself. */
const HEALTH_TTL_SECONDS = 24 * 60 * 60;
/** How long an isolate trusts what it last read, so a hot path does not read KV on every message. */
export const HEALTH_CACHE_MS = 15_000;

const HealthSchema = z.record(
  z.string(),
  z.object({
    reason: z.enum(HEALTH_REASONS),
    strikes: z.number().int().min(1),
    until: z.string().nullable(),
  }),
);

/** What an isolate last read or wrote, and when (its own clock). */
export type HealthCache = { value?: { readonly health: Health; readonly at: number } };

/** This isolate's cache: one per isolate, as a deployment has one namespace. */
const ISOLATE_CACHE: HealthCache = {};

type KvHealthOptions = {
  readonly cache?: HealthCache;
  /** The isolate's clock for the cache (not the read's `now`, which a drain holds still). */
  readonly clock?: () => number;
};

/** What KV holds; nothing when it cannot be read, so a read asks in the configured order. */
const fetchHealth = async (kv: KVNamespace): Promise<Health> => {
  try {
    return HealthSchema.safeParse(await kv.get(HEALTH_KEY, "json")).data ?? {};
  } catch (error) {
    log.warn("llm: provider health not read", { why: String(error) });
    return {};
  }
};

const storeHealth = async (kv: KVNamespace, health: Health): Promise<void> => {
  try {
    await (Object.keys(health).length === 0
      ? kv.delete(HEALTH_KEY)
      : kv.put(HEALTH_KEY, JSON.stringify(health), { expirationTtl: HEALTH_TTL_SECONDS }));
  } catch (error) {
    log.warn("llm: provider health not written", { why: String(error) });
  }
};

/**
The health shared by every user and isolate, in Workers KV. Reads are cached for
`HEALTH_CACHE_MS`; a read's verdicts write only when they change a record (a new penalty, the
first success after one), read afresh just before so another isolate's change is not dropped. KV
is eventually consistent (about a minute across locations): another location may ask a provider
first once more within that minute, which costs one wait, not a wrong answer.
*/
export const kvHealth = (kv: KVNamespace, options: KvHealthOptions = {}): HealthMemory => {
  const { cache = ISOLATE_CACHE, clock = Date.now } = options;
  const remember = (health: Health): Health => {
    cache.value = { at: clock(), health };
    return health;
  };
  const read = async (): Promise<Health> => {
    const cached = cache.value;
    return cached !== undefined && clock() - cached.at < HEALTH_CACHE_MS
      ? cached.health
      : remember(await fetchHealth(kv));
  };
  return {
    read,
    record: async (verdicts, now) => {
      if (nextHealth(await read(), verdicts, now).changes.length === 0) {
        return;
      }
      const next = nextHealth(await fetchHealth(kv), verdicts, now);
      if (next.changes.length > 0) {
        await storeHealth(kv, next.health);
        logChanges(next.changes);
      }
      remember(next.health);
    },
  };
};

/** The deployment's health memory, from the bindings of this request or Durable Object. */
export const llmHealthOf = (env: { readonly OAUTH_KV: KVNamespace }): HealthMemory =>
  kvHealth(env.OAUTH_KV);
