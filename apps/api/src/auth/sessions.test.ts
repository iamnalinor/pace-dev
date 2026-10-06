import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "../shared/crypto.ts";
import { d1 } from "../shared/db/d1.ts";
import { createSession, findSession, revokeSession } from "./sessions.ts";
import { upsertTelegramUser } from "./users.ts";

const NOW = Date.UTC(2026, 9, 6, 10);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Storage is shared within a test file, so every test gets its own user.
const seedUser = async () =>
  await upsertTelegramUser(
    d1(env.DB),
    { name: "Ada", photoUrl: null, telegramId: `2000-${crypto.randomUUID()}`, username: "ada" },
    NOW,
  );

const sessionRow = async (token: string) =>
  await env.DB.prepare("select token_hash, last_seen_at from sessions where token_hash = ?")
    .bind(await sha256Hex(token))
    .first<{ token_hash: string; last_seen_at: number }>();

describe("sessions", () => {
  it("issues an opaque token that resolves to the user for 90 days", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const session = await createSession(db, { label: "web", now: NOW, userId: user.id });
    expect(session.token).toMatch(/^[\w-]{43}$/);
    expect(session.expiresAt).toBe(NOW + 90 * DAY);
    expect(await findSession(db, session.token, NOW + 89 * DAY)).toEqual(user);
    expect(await findSession(db, session.token, NOW + 90 * DAY + 1)).toBeNull();
  });

  it("never stores the token itself", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const session = await createSession(db, { label: "web", now: NOW, userId: user.id });
    const row = await sessionRow(session.token);
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.token_hash).not.toBe(session.token);
  });

  it("rejects unknown and revoked tokens", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const session = await createSession(db, { label: "web", now: NOW, userId: user.id });
    expect(await findSession(db, "not-a-token", NOW)).toBeNull();
    await revokeSession(db, session.token);
    expect(await findSession(db, session.token, NOW)).toBeNull();
  });

  it("touches lastSeenAt at most once per hour", async () => {
    const db = d1(env.DB);
    const user = await seedUser();
    const session = await createSession(db, { label: "web", now: NOW, userId: user.id });
    const lastSeen = async (): Promise<number | undefined> =>
      (await sessionRow(session.token))?.last_seen_at;

    await findSession(db, session.token, NOW + HOUR - 1);
    expect(await lastSeen()).toBe(NOW);
    await findSession(db, session.token, NOW + HOUR + 1);
    expect(await lastSeen()).toBe(NOW + HOUR + 1);
  });
});
