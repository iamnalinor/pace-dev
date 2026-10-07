import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { d1 } from "../shared/db/d1.ts";
import { findUserById, upsertTelegramUser } from "./users.ts";

const NOW = Date.UTC(2026, 9, 6, 10);

describe("upsertTelegramUser", () => {
  it("creates the user once and refreshes the profile on later logins", async () => {
    const db = d1(env.DB);
    const first = await upsertTelegramUser(
      db,
      { name: "Ada", photoUrl: null, telegramId: "1001", username: "ada" },
      NOW,
    );
    expect(first.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(first).toMatchObject({
      name: "Ada",
      photoUrl: null,
      telegramId: "1001",
      username: "ada",
    });

    const second = await upsertTelegramUser(
      db,
      { name: "Ada L.", photoUrl: "https://t.me/p.jpg", telegramId: "1001", username: null },
      NOW + 1,
    );
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      name: "Ada L.",
      photoUrl: "https://t.me/p.jpg",
      username: null,
    });
    expect(await findUserById(db, first.id)).toEqual(second);
  });

  it("keeps the stored photo when the login source has none (bot logins carry no photo)", async () => {
    const db = d1(env.DB);
    await upsertTelegramUser(
      db,
      { name: "Ada", photoUrl: "https://t.me/p.jpg", telegramId: "1002", username: "ada" },
      NOW,
    );
    const user = await upsertTelegramUser(
      db,
      { name: "Ada", photoUrl: undefined, telegramId: "1002", username: "ada" },
      NOW,
    );
    expect(user.photoUrl).toBe("https://t.me/p.jpg");
  });
});
