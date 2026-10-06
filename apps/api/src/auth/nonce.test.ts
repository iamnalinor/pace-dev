import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { d1 } from "../shared/db/d1.ts";
import { bindNonce, consumeNonce, createNonce } from "./nonce.ts";
import { upsertTelegramUser } from "./users.ts";

const NOW = Date.UTC(2026, 9, 6, 10);
const MINUTE = 60 * 1000;

// Storage is shared within a test file, so every test gets its own user.
const seedUser = async () =>
  await upsertTelegramUser(
    d1(env.DB),
    { name: "Ada", photoUrl: null, telegramId: `3000-${crypto.randomUUID()}`, username: "ada" },
    NOW,
  );

describe("login nonces", () => {
  it("mints a 32-char base64url nonce that is pending until bound", async () => {
    const db = d1(env.DB);
    const { nonce } = await createNonce(db, NOW);
    expect(nonce).toMatch(/^[\w-]{32}$/);
    expect(await consumeNonce(db, nonce, NOW)).toEqual({ status: "pending" });
  });

  it("is consumed exactly once after the bot bound it", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const { nonce } = await createNonce(db, NOW);
    expect(await bindNonce(db, { nonce, now: NOW + MINUTE, userId: user.id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await consumeNonce(db, nonce, NOW + 2 * MINUTE)).toEqual({
      status: "ready",
      userId: user.id,
    });
    expect(await consumeNonce(db, nonce, NOW + 2 * MINUTE)).toEqual({ status: "not-found" });
  });

  it("expires after five minutes and rejects unknown nonces", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const { nonce } = await createNonce(db, NOW);
    expect(await bindNonce(db, { nonce, now: NOW + 5 * MINUTE + 1, userId: user.id })).toEqual({
      error: "nonce/not-found",
      ok: false,
    });
    expect(await consumeNonce(db, nonce, NOW + 5 * MINUTE + 1)).toEqual({ status: "not-found" });
    expect(await bindNonce(db, { nonce: "nope", now: NOW, userId: user.id })).toEqual({
      error: "nonce/not-found",
      ok: false,
    });
  });

  it("cannot be bound twice", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const { nonce } = await createNonce(db, NOW);
    await bindNonce(db, { nonce, now: NOW, userId: user.id });
    expect(await bindNonce(db, { nonce, now: NOW, userId: user.id })).toEqual({
      error: "nonce/already-bound",
      ok: false,
    });
  });
});
