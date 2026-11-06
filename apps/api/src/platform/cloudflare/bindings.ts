import type { AppBindings } from "../../shared/ports/bindings.ts";

import { objectHealth } from "../../shared/llm/health-store.ts";
import { archiveStore } from "./archive-store.ts";
import { keyValue } from "./key-value.ts";
import { oauth } from "./oauth.ts";
import { d1 } from "./sqlite.ts";

/** Preserve numbered LLM settings without carrying future object bindings into application code. */
const stringSettings = (env: object): Record<string, string> => {
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      settings[key] = value;
    }
  }
  return settings;
};

/** Read raw host bindings at composition, never at module scope. */
export const cloudflareBindings = (env: Cloudflare.Env): AppBindings => ({
  ...stringSettings(env),
  ENVIRONMENT: env.ENVIRONMENT,
  WEB_ORIGIN: env.WEB_ORIGIN,
  ALLOWED_TELEGRAM_IDS: env.ALLOWED_TELEGRAM_IDS,
  TELEGRAM_BOT_USERNAME: env.TELEGRAM_BOT_USERNAME,
  ...(env.CF_VERSION_METADATA !== undefined && {
    CF_VERSION_METADATA: { id: env.CF_VERSION_METADATA.id },
  }),
  ...(env.HISTORY_ARCHIVE !== undefined && { HISTORY_ARCHIVE: archiveStore(env.HISTORY_ARCHIVE) }),
  DB: d1(env.DB),
  LLM_HEALTH: objectHealth(() => env.LLM_HEALTH.get(env.LLM_HEALTH.idFromName("global"))),
  OAUTH_KV: keyValue(env.OAUTH_KV),
  OAUTH_PROVIDER: env.OAUTH_PROVIDER === undefined ? undefined : oauth(env.OAUTH_PROVIDER),
  USER_STORE: { of: (userId) => env.USER_STORE.get(env.USER_STORE.idFromName(userId)) },
});
