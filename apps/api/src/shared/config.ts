import type { UserFromGetMe } from "grammy/types";

import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

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
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const EnvSchema = z.object({
  ENVIRONMENT: z.enum(["development", "test", "production"]),
  ALLOWED_TELEGRAM_IDS: z.string().transform(csv),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  WEB_ORIGIN: z.url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_API_ROOT: z.url().default("https://api.telegram.org"),
  BOT_INFO: z.string().transform(parseJson).pipe(BotInfoSchema).optional(),
});

export type Config = {
  readonly environment: "development" | "production" | "test";
  readonly allowedTelegramIds: readonly string[];
  readonly telegramBotUsername: string;
  readonly webOrigin: string;
  readonly telegramBotToken: string | undefined;
  readonly telegramWebhookSecret: string | undefined;
  readonly telegramApiRoot: string;
  readonly botInfo: undefined | UserFromGetMe;
};

/** Reads and validates the Worker's vars and secrets; a failure names the offending variable. */
export const loadConfig = (env: object): Result<Config, string> => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(`config: ${issue?.path.join(".") ?? "env"}: ${issue?.message ?? "invalid"}`);
  }
  const value = parsed.data;
  return ok({
    environment: value.ENVIRONMENT,
    allowedTelegramIds: value.ALLOWED_TELEGRAM_IDS,
    telegramBotUsername: value.TELEGRAM_BOT_USERNAME,
    webOrigin: value.WEB_ORIGIN,
    telegramBotToken: value.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: value.TELEGRAM_WEBHOOK_SECRET,
    telegramApiRoot: value.TELEGRAM_API_ROOT,
    botInfo: value.BOT_INFO,
  });
};
