import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.ts";

const base = {
  ALLOWED_TELEGRAM_IDS: " 1001, 1002 ,,",
  ENVIRONMENT: "test",
  TELEGRAM_BOT_USERNAME: "PaceTestBot",
  WEB_ORIGIN: "https://pace.test",
};

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
});
