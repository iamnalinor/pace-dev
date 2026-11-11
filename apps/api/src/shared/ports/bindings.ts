import type { Db } from "../db/d1.ts";
import type { Health, Verdict } from "../llm/health.ts";
import type { ArchiveStore } from "./archive-store.ts";
import type { KeyValue } from "./key-value.ts";
import type { OAuth } from "./oauth.ts";
import type { UserStoreHost } from "./user-store-host.ts";

/** Parsed configuration still comes from strings; runtime services are already adapted. */
export type AppBindings = {
  readonly HISTORY_ARCHIVE?: ArchiveStore;
  readonly OAUTH_PROVIDER?: OAuth | undefined;
  readonly DB: Db;
  readonly USER_STORE: UserStoreHost;
  readonly OAUTH_KV: KeyValue;
  readonly LLM_HEALTH: {
    readonly read: () => Promise<Health>;
    readonly record: (verdicts: readonly Verdict[], now: string) => Promise<void>;
  };
  readonly ENVIRONMENT: string;
  readonly WEB_ORIGIN: string;
  readonly ALLOWED_TELEGRAM_IDS: string;
  readonly TELEGRAM_BOT_USERNAME: string;
  readonly API_ORIGIN?: string;
  readonly PACE_VERSION?: string;
  readonly PACE_HISTORY_CHECKPOINT_MODE?: string;
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_WEBHOOK_SECRET?: string;
  readonly TELEGRAM_WEBHOOK_ALLOWED_CIDRS?: string;
  readonly TELEGRAM_API_ROOT?: string;
  readonly BOT_INFO?: string;
  readonly LLM_PROVIDER?: string;
  readonly FIREBASE_SERVICE_ACCOUNT?: string;
  readonly FIREBASE_ANDROID_CONFIG?: string;
  readonly PACE_FIREBASE_CONFIG_POLICY?: string;
  readonly PACE_DEPLOY_ATTEMPT?: string;
  readonly CF_VERSION_METADATA?: { readonly id?: unknown };
};

/** A small health RPC endpoint used by the caching service. */
export type HealthActor = {
  readonly read: () => Promise<Health>;
  readonly record: (verdicts: readonly Verdict[], now: string) => Promise<Health>;
};
