import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { d1 } from "../shared/db/d1.ts";
import { bindNonce, consumeNonce, createNonce, recordNonceSession } from "./nonce.ts";
import { upsertTelegramUser } from "./users.ts";

const NOW = Date.UTC(2026, 9, 6, 10);
const MINUTE = 60 * 1000;

const NOWHERE = { city: null, country: null, ip: null, userAgent: null };
/** A nonce asked for by a browser with nothing known about where it is. */
const fromWeb = { from: "web" as const, now: NOW, place: NOWHERE };

// Storage is shared within a test file, so every test gets its own user.
const seedUser = async () =>
  await upsertTelegramUser(
    d1(env.DB),
    {
      firstName: "Ada",
      name: "Ada",
      photoUrl: null,
      telegramId: `3000-${crypto.randomUUID()}`,
      username: "ada",
    },
    NOW,
  );

describe("login nonces", () => {
  it("mints a 32-char base64url nonce that is pending until bound", async () => {
    const db = d1(env.DB);
    const { nonce } = await createNonce(db, fromWeb);
    expect(nonce).toMatch(/^[\w-]{32}$/);
    expect(await consumeNonce(db, nonce, NOW)).toEqual({ status: "pending" });
  });

  it("is consumed exactly once after the bot bound it", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const { nonce } = await createNonce(db, fromWeb);
    expect(await bindNonce(db, { nonce, now: NOW + MINUTE, userId: user.id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await consumeNonce(db, nonce, NOW + 2 * MINUTE)).toEqual({
      login: { deviceId: null, deviceName: null, from: "web", place: NOWHERE },
      status: "ready",
      userId: user.id,
    });
    expect(await consumeNonce(db, nonce, NOW + 2 * MINUTE)).toEqual({ status: "not-found" });
  });

  it("expires after five minutes and rejects unknown nonces", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const { nonce } = await createNonce(db, fromWeb);
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
    const { nonce } = await createNonce(db, fromWeb);
    await bindNonce(db, { nonce, now: NOW, userId: user.id });
    expect(await bindNonce(db, { nonce, now: NOW, userId: user.id })).toEqual({
      error: "nonce/already-bound",
      ok: false,
    });
  });

  it("keeps where the login started and the phone the app named, and hands them over once", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address Cloudflare reported is a fixture
    const place = { city: "Berlin", country: "DE", ip: "5.6.7.8", userAgent: "okhttp/4.12.0" };
    const { nonce } = await createNonce(db, {
      deviceId: "dev-1",
      deviceName: "Pixel 9a",
      from: "app",
      now: NOW,
      place,
    });
    await bindNonce(db, { nonce, now: NOW, userId: user.id });
    expect(await consumeNonce(db, nonce, NOW)).toEqual({
      login: { deviceId: "dev-1", deviceName: "Pixel 9a", from: "app", place },
      status: "ready",
      userId: user.id,
    });
  });

  it("records the session it opened", async () => {
    const db = d1(env.DB);
    const { nonce } = await createNonce(db, fromWeb);
    await recordNonceSession(db, nonce, "session-1");
    const row = await env.DB.prepare("select session_id from login_nonces where nonce = ?")
      .bind(nonce)
      .first<{ session_id: null | string }>();
    expect(row?.session_id).toBe("session-1");
  });

  it("clears expired nonces when a new one is minted, and keeps live ones", async () => {
    const db = d1(env.DB);
    const isStored = async (nonce: string): Promise<boolean> =>
      (await env.DB.prepare("select nonce from login_nonces where nonce = ?")
        .bind(nonce)
        .first()) !== null;
    const expired = await createNonce(db, fromWeb);
    const live = await createNonce(db, { ...fromWeb, now: NOW + MINUTE });
    await createNonce(db, { ...fromWeb, now: NOW + 5 * MINUTE });
    expect(await isStored(expired.nonce)).toBe(false);
    expect(await isStored(live.nonce)).toBe(true);
  });
});
