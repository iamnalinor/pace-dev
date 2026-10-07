import { describe, expect, it } from "vitest";

import { verifyTelegramLogin } from "./telegram-widget.ts";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
const NOW = 1_759_744_800; // 2025-10-06T10:00:00Z

const encoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** The reference algorithm from https://core.telegram.org/widgets/login#checking-authorization. */
const sign = async (fields: Record<string, number | string>): Promise<string> => {
  const checkString = Object.keys(fields)
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode(BOT_TOKEN));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(checkString)));
};

const fields = {
  auth_date: NOW - 60,
  first_name: "Ada",
  id: 1001,
  last_name: "Lovelace",
  photo_url: "https://t.me/i/userpic/320/ada.jpg",
  username: "ada",
};

describe("verifyTelegramLogin", () => {
  it("accepts a correctly signed, fresh payload and maps it to a user", async () => {
    const result = await verifyTelegramLogin(
      { ...fields, hash: await sign(fields) },
      BOT_TOKEN,
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Ada Lovelace",
        photoUrl: "https://t.me/i/userpic/320/ada.jpg",
        telegramId: "1001",
        username: "ada",
      },
    });
  });

  it("ignores absent optional fields when building the check string", async () => {
    const minimal = { auth_date: NOW, first_name: "Ada", id: 1001 };
    const result = await verifyTelegramLogin(
      { ...minimal, hash: await sign(minimal) },
      BOT_TOKEN,
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: { name: "Ada", photoUrl: null, telegramId: "1001", username: null },
    });
  });

  it("rejects a tampered payload", async () => {
    const hash = await sign(fields);
    const result = await verifyTelegramLogin({ ...fields, hash, id: 1002 }, BOT_TOKEN, NOW);
    expect(result).toEqual({ error: "auth/invalid-hash", ok: false });
  });

  it("rejects a hash of the wrong length without throwing", async () => {
    const result = await verifyTelegramLogin({ ...fields, hash: "abc" }, BOT_TOKEN, NOW);
    expect(result).toEqual({ error: "auth/invalid-hash", ok: false });
  });

  it("rejects a payload signed by another bot", async () => {
    const hash = await sign(fields);
    const result = await verifyTelegramLogin({ ...fields, hash }, "999:other", NOW);
    expect(result).toEqual({ error: "auth/invalid-hash", ok: false });
  });

  it("rejects a payload older than five minutes", async () => {
    const stale = { ...fields, auth_date: NOW - 301 };
    const result = await verifyTelegramLogin({ ...stale, hash: await sign(stale) }, BOT_TOKEN, NOW);
    expect(result).toEqual({ error: "auth/expired", ok: false });
  });
});
