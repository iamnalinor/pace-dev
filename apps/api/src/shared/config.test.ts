import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.ts";

const base = {
  ALLOWED_TELEGRAM_IDS: " 1001, 1002 ,,",
  ENVIRONMENT: "test",
  TELEGRAM_BOT_USERNAME: "PaceTestBot",
  WEB_ORIGIN: "https://pace.test",
};

/** The two Telegram subnets, as the var is written in wrangler.jsonc. */
const TELEGRAM_CIDRS = "149.154.160.0/20,91.108.4.0/22";
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- a typo fixture: the prefix length is out of range
const BAD_CIDR = "149.154.160.0/33";

describe("loadConfig", () => {
  it("parses the csv whitelist and defaults the optional values", () => {
    const result = loadConfig(base);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.allowedTelegramIds).toEqual(["1001", "1002"]);
    expect(result.value.environment).toBe("test");
    expect(result.value.telegramBotToken).toBeUndefined();
    expect(result.value.telegramApiRoot).toBe("https://api.telegram.org");
    expect(result.value.botInfo).toBeUndefined();
  });

  it("reads numbered LLM endpoints in priority order; a slot may list several models and keys", () => {
    const result = loadConfig({
      ...base,
      LLM_API_KEY_1: "k1, k2\nk3",
      LLM_API_KEY_10: "late",
      LLM_API_KEY_2: "g",
      LLM_BASE_URL_1: "https://models.example/v1",
      LLM_BASE_URL_10: "https://late.example/v1",
      LLM_BASE_URL_2: "https://gemini.example/v1beta/openai",
      LLM_MODEL_1: "luna, sol",
      LLM_MODEL_10: "slow",
      LLM_MODEL_2: "gemini-flash-latest",
    });
    expect(result.ok && result.value.llmEndpoints).toEqual([
      {
        apiKeys: ["k1", "k2", "k3"],
        baseUrl: "https://models.example/v1",
        models: ["luna", "sol"],
        slot: 1,
      },
      {
        apiKeys: ["g"],
        baseUrl: "https://gemini.example/v1beta/openai",
        models: ["gemini-flash-latest"],
        slot: 2,
      },
      { apiKeys: ["late"], baseUrl: "https://late.example/v1", models: ["slow"], slot: 10 },
    ]);
    const unset = loadConfig(base);
    expect(unset.ok && unset.value.llmEndpoints).toEqual([]);
  });

  it("treats empty values as unset and a leading zero as no slot", () => {
    const result = loadConfig({
      ...base,
      LLM_API_KEY_01: "k",
      LLM_API_KEY_1: "",
      LLM_BASE_URL_01: "https://models.example/v1",
      LLM_BASE_URL_1: " ",
      LLM_MODEL_01: "luna",
      LLM_MODEL_1: "",
    });
    expect(result.ok && result.value.llmEndpoints).toEqual([]);
  });

  it("ignores the old unnumbered LLM_* names", () => {
    const result = loadConfig({
      ...base,
      LLM_API_KEY: "k",
      LLM_BASE_URL: "https://models.example/v1",
      LLM_MODEL: "luna",
    });
    expect(result.ok && result.value.llmEndpoints).toEqual([]);
  });

  it("names the variable an incomplete or invalid LLM slot misses", () => {
    expect(loadConfig({ ...base, LLM_API_KEY_1: "secret" })).toEqual({
      error: "config: LLM_BASE_URL_1: LLM_BASE_URL_1, LLM_API_KEY_1 and LLM_MODEL_1 go together",
      ok: false,
    });
    expect(
      loadConfig({ ...base, LLM_BASE_URL_2: "https://models.example/v1", LLM_MODEL_2: "m" }),
    ).toEqual({
      error: "config: LLM_API_KEY_2: LLM_BASE_URL_2, LLM_API_KEY_2 and LLM_MODEL_2 go together",
      ok: false,
    });
    expect(
      loadConfig({ ...base, LLM_API_KEY_1: "k", LLM_BASE_URL_1: "not-a-url", LLM_MODEL_1: "m" }),
    ).toEqual({ error: "config: LLM_BASE_URL_1: must be an HTTP URL", ok: false });
    expect(
      loadConfig({
        ...base,
        LLM_API_KEY_1: " , ",
        LLM_BASE_URL_1: "https://m.example",
        LLM_MODEL_1: "m",
      }).ok,
    ).toBe(false);
  });

  it("rejects an invalid web origin and an unknown environment", () => {
    expect(loadConfig({ ...base, WEB_ORIGIN: "pace.test" }).ok).toBe(false);
    expect(loadConfig({ ...base, ENVIRONMENT: "staging" }).ok).toBe(false);
  });

  it("parses BOT_INFO as JSON when present", () => {
    const result = loadConfig({
      ...base,
      BOT_INFO: JSON.stringify({ id: 7, is_bot: true, first_name: "Pace", username: "PaceBot" }),
    });
    expect(result.ok && result.value.botInfo?.username).toBe("PaceBot");
    expect(loadConfig({ ...base, BOT_INFO: "{" }).ok).toBe(false);
  });

  it("parses TELEGRAM_WEBHOOK_ALLOWED_CIDRS as a csv; unset or empty disables the check", () => {
    const unset = loadConfig(base);
    expect(unset.ok && unset.value.telegramWebhookAllowedCidrs).toEqual([]);
    const empty = loadConfig({ ...base, TELEGRAM_WEBHOOK_ALLOWED_CIDRS: " , " });
    expect(empty.ok && empty.value.telegramWebhookAllowedCidrs).toEqual([]);
    const telegram = loadConfig({
      ...base,
      TELEGRAM_WEBHOOK_ALLOWED_CIDRS: ` ${TELEGRAM_CIDRS.replace(",", " , ")},`,
    });
    expect(telegram.ok && telegram.value.telegramWebhookAllowedCidrs).toEqual(
      TELEGRAM_CIDRS.split(","),
    );
  });

  it("fails on a CIDR typo and names the variable and the entry", () => {
    const result = loadConfig({
      ...base,
      TELEGRAM_WEBHOOK_ALLOWED_CIDRS: `${TELEGRAM_CIDRS},${BAD_CIDR}`,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("TELEGRAM_WEBHOOK_ALLOWED_CIDRS");
    expect(!result.ok && result.error).toContain(BAD_CIDR);
    expect(loadConfig({ ...base, TELEGRAM_WEBHOOK_ALLOWED_CIDRS: "telegram" }).ok).toBe(false);
    expect(loadConfig({ ...base, TELEGRAM_WEBHOOK_ALLOWED_CIDRS: "2001:db8::/32" }).ok).toBe(false);
  });
});
