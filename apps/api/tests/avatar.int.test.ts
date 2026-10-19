import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.ts";
import { hmacSha256Hex } from "../src/shared/crypto.ts";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const widget = async (telegramId: number) => {
  const fields = { auth_date: nowSeconds(), first_name: "Ada", id: telegramId };
  const text = Object.keys(fields)
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((key) => `${key}=${String(fields[key as keyof typeof fields])}`)
    .join("\n");
  const secret = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN ?? ""),
  );
  return { ...fields, hash: await hmacSha256Hex(secret, text) };
};

describe("cached Telegram avatar", () => {
  it("refreshes on login and serves the photo through Pace without the bot token", async () => {
    const methods: string[] = [];
    const app = createApp({
      fetch: async () => {
        throw new Error("unexpected link fetch");
      },
      parseProviders: () => [],
      telegramFetch: async (input) => {
        const url = String(input);
        methods.push(url);
        if (url.endsWith("getUserProfilePhotos")) {
          return Response.json({ ok: true, result: { photos: [[{ file_id: "photo" }]] } });
        }
        if (url.endsWith("getFile")) {
          return Response.json({ ok: true, result: { file_path: "photos/profile.jpg" } });
        }
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { "Content-Type": "image/jpeg" },
        });
      },
    });
    const login = async () => {
      const telegramBody = await widget(1001);
      return await app.fetch(
        new Request("https://pace-api.test/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(telegramBody),
        }),
        env,
      );
    };
    const first = await login();
    expect(first.status).toBe(200);
    const body = await first.json<{ user: { photoUrl: string } }>();
    expect(body.user.photoUrl).toMatch(/^https:\/\/pace-api\.test\/api\/avatars\//u);
    expect(body.user.photoUrl).not.toContain(env.TELEGRAM_BOT_TOKEN ?? "secret");
    const photo = await app.fetch(new Request(body.user.photoUrl), env);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    await login();
    expect(methods.filter((method) => method.endsWith("getUserProfilePhotos"))).toHaveLength(2);
  });
});
