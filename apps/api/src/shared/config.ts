import type { UserFromGetMe } from "grammy/types";

import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import { parseCidr } from "./ip.ts";

/** `getMe` as stored in BOT_INFO; the capability flags default to false when the JSON is trimmed. */
const BotInfoSchema = z.object({
  id: z.number().int(),
  is_bot: z.literal(true),
  first_name: z.string(),
  username: z.string(),
  can_join_groups: z.boolean().default(false),
  can_read_all_group_messages: z.boolean().default(false),
  supports_inline_queries: z.boolean().default(false),
  can_connect_to_business: z.boolean().default(false),
  has_main_web_app: z.boolean().default(false),
  has_topics_enabled: z.boolean().default(false),
  allows_users_to_create_topics: z.boolean().default(false),
  can_manage_bots: z.boolean().default(false),
  supports_join_request_queries: z.boolean().default(false),
}) satisfies z.ZodType<UserFromGetMe>;

const parseJson = (text: string, ctx: z.RefinementCtx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "not valid JSON" });
    return z.NEVER;
  }
};

const csv = (text: string): readonly string[] =>
  text
    .split(/[\s,]+/u)
    .map((item) => item.trim())
    .filter((item) => item !== "");

/** Comma-separated CIDRs; every entry must parse so a typo fails config loading, not a webhook call. */
const cidrList = (text: string, ctx: z.RefinementCtx): readonly string[] => {
  const entries = csv(text);
  for (const entry of entries) {
    const parsed = parseCidr(entry);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
  }
  return entries;
};

const EnvSchema = z.object({
  ENVIRONMENT: z.enum(["development", "test", "production"]),
  ALLOWED_TELEGRAM_IDS: z.string().transform(csv),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  WEB_ORIGIN: z.url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_ALLOWED_CIDRS: z.string().default("").transform(cidrList),
  TELEGRAM_API_ROOT: z.url().default("https://api.telegram.org"),
  BOT_INFO: z.string().transform(parseJson).pipe(BotInfoSchema).optional(),
  LLM_PROVIDER: z.enum(["auto", "fake"]).default("auto"),
});

/** One OpenAI-compatible endpoint: its models are tried in order, each with every key. */
export type LlmEndpoint = {
  /** The N of `LLM_BASE_URL_N`: lower numbers are asked first. */
  readonly slot: number;
  readonly baseUrl: string;
  readonly apiKeys: readonly string[];
  readonly models: readonly string[];
};

// `_1`, `_2`, …: a leading zero (`_01`) is not a slot number, so it cannot merge with `_1`.
const LLM_VAR = /^LLM_(API_KEY|BASE_URL|MODEL)_(0|[1-9]\d*)$/u;
const LLM_PARTS = ["BASE_URL", "API_KEY", "MODEL"] as const;

const isHttpUrl = (text: string): boolean =>
  URL.canParse(text) && ["http:", "https:"].includes(new URL(text).protocol);

type SlotParts = Partial<Record<(typeof LLM_PARTS)[number], string>>;

/** The `LLM_*_N` values of `env`, grouped by N. */
const llmSlotsOf = (env: object): ReadonlyMap<number, SlotParts> => {
  const slots = new Map<number, SlotParts>();
  for (const [name, value] of Object.entries(env)) {
    const match = LLM_VAR.exec(name);
    // An empty value counts as unset (`LLM_BASE_URL_1=` in a .dev.vars).
    if (match === null || typeof value !== "string" || value.trim() === "") {
      continue;
    }
    const slot = Number(match[2]);
    const part = match[1] as (typeof LLM_PARTS)[number];
    slots.set(slot, { ...slots.get(slot), [part]: value.trim() });
  }
  return slots;
};

/** One slot read and checked; a failure is `[variable, message]`. */
const llmEndpointOf = (
  slot: number,
  parts: SlotParts,
): Result<LlmEndpoint, readonly [string, string]> => {
  const [urlName = "", keyName = "", modelName = ""] = LLM_PARTS.map(
    (part) => `LLM_${part}_${String(slot)}`,
  );
  const baseUrl = parts.BASE_URL ?? "";
  const apiKeys = csv(parts.API_KEY ?? "");
  const models = csv(parts.MODEL ?? "");
  const missing = [baseUrl !== "", apiKeys.length > 0, models.length > 0].indexOf(false);
  if (missing !== -1) {
    const name = [urlName, keyName, modelName][missing] ?? urlName;
    return err([name, `${urlName}, ${keyName} and ${modelName} go together`]);
  }
  return isHttpUrl(baseUrl)
    ? ok({ apiKeys, baseUrl, models, slot })
    : err([urlName, "must be an HTTP URL"]);
};

/**
The numbered LLM slots: `LLM_BASE_URL_N`, `LLM_API_KEY_N` and `LLM_MODEL_N` set together, any N,
lowest first. A slot may list several models and keys (comma or newline separated).
*/
const llmEndpointsOf = (env: object): Result<readonly LlmEndpoint[], readonly [string, string]> => {
  const endpoints: LlmEndpoint[] = [];
  const slots = [...llmSlotsOf(env)].toSorted(([a], [b]) => a - b);
  for (const [slot, parts] of slots) {
    const endpoint = llmEndpointOf(slot, parts);
    if (!endpoint.ok) {
      return endpoint;
    }
    endpoints.push(endpoint.value);
  }
  return ok(endpoints);
};

export type Config = {
  readonly environment: "development" | "production" | "test";
  readonly allowedTelegramIds: readonly string[];
  readonly telegramBotUsername: string;
  readonly webOrigin: string;
  readonly telegramBotToken: string | undefined;
  readonly telegramWebhookSecret: string | undefined;
  /** Source subnets the webhook accepts (checked against `CF-Connecting-IP`); empty = check disabled. */
  readonly telegramWebhookAllowedCidrs: readonly string[];
  readonly telegramApiRoot: string;
  readonly botInfo: undefined | UserFromGetMe;
  /** The LLM endpoints in priority order; empty = no model, the rules read messages. */
  readonly llmEndpoints: readonly LlmEndpoint[];
  /** `fake` answers from inside the Worker (tests, e2e); `auto` uses the providers with a key. */
  readonly llmProvider: "auto" | "fake";
};

/** Reads and validates the Worker's vars and secrets; a failure names the offending variable. */
export const loadConfig = (env: object): Result<Config, string> => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(`config: ${issue?.path.join(".") ?? "env"}: ${issue?.message ?? "invalid"}`);
  }
  const value = parsed.data;
  const llm = llmEndpointsOf(env);
  if (!llm.ok) {
    return err(`config: ${llm.error[0]}: ${llm.error[1]}`);
  }
  return ok({
    environment: value.ENVIRONMENT,
    allowedTelegramIds: value.ALLOWED_TELEGRAM_IDS,
    telegramBotUsername: value.TELEGRAM_BOT_USERNAME,
    webOrigin: value.WEB_ORIGIN,
    telegramBotToken: value.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: value.TELEGRAM_WEBHOOK_SECRET,
    telegramWebhookAllowedCidrs: value.TELEGRAM_WEBHOOK_ALLOWED_CIDRS,
    telegramApiRoot: value.TELEGRAM_API_ROOT,
    botInfo: value.BOT_INFO,
    llmEndpoints: llm.value,
    llmProvider: value.LLM_PROVIDER,
  });
};
