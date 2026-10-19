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

  it("reads a configurable compatible model and several keys, comma or newline separated", () => {
    const result = loadConfig({
      ...base,
      LLM_API_KEY: "k1, k2\nk3",
      LLM_BASE_URL: "https://models.example/v1",
      LLM_MODEL: "reader-small",
    });
    expect(result.ok && result.value.llmApiKeys).toEqual(["k1", "k2", "k3"]);
    expect(result.ok && result.value.llmBaseUrl).toBe("https://models.example/v1");
    expect(result.ok && result.value.llmModel).toBe("reader-small");
    const unset = loadConfig(base);
    expect(unset.ok && unset.value.llmApiKeys).toEqual([]);
  });

  it("rejects incomplete model configuration but works with no model configured", () => {
    expect(loadConfig(base).ok).toBe(true);
    expect(loadConfig({ ...base, LLM_API_KEY: "secret" }).ok).toBe(false);
    expect(loadConfig({ ...base, LLM_BASE_URL: "https://models.example/v1" }).ok).toBe(false);
    expect(
      loadConfig({ ...base, LLM_BASE_URL: "http://localhost:3000/v1", LLM_MODEL: "local" }).ok,
    ).toBe(false);
    expect(
      loadConfig({
        ...base,
        LLM_API_KEY: "secret",
        LLM_BASE_URL: "not-a-url",
        LLM_MODEL: "local",
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
