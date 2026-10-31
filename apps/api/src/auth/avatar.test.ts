import { describe, expect, it } from "vitest";

import { readTelegramAvatar } from "./avatar.ts";

describe("readTelegramAvatar", () => {
  it("fetches the latest Telegram photo without returning a token-bearing URL", async () => {
    const calls: string[] = [];
    const result = await readTelegramAvatar(
      {
        apiRoot: "https://api.telegram.org",
        token: "secret",
        fetch: async (input) => {
          const url = String(input);
          calls.push(url);
          if (url.endsWith("getUserProfilePhotos")) {
            return Response.json({
              ok: true,
              result: { photos: [[{ file_id: "small" }, { file_id: "large" }]] },
            });
          }
          if (url.endsWith("getFile")) {
            return Response.json({ ok: true, result: { file_path: "photos/avatar.jpg" } });
          }
          return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
            headers: { "Content-Type": "image/jpeg" },
          });
        },
      },
      "1001",
    );
    expect(result).toEqual({ data: "/9j/", mime: "image/jpeg" });
    expect(calls).toEqual([
      "https://api.telegram.org/botsecret/getUserProfilePhotos",
      "https://api.telegram.org/botsecret/getFile",
      "https://api.telegram.org/file/botsecret/photos/avatar.jpg",
    ]);
  });

  it("returns null when the user has no photo and ignores unsafe file paths", async () => {
    const noPhoto = await readTelegramAvatar(
      {
        apiRoot: "https://api.telegram.org",
        token: "secret",
        fetch: async () => Response.json({ ok: true, result: { photos: [] } }),
      },
      "1001",
    );
    expect(noPhoto).toBeNull();
    const unsafe = await readTelegramAvatar(
      {
        apiRoot: "https://api.telegram.org",
        token: "secret",
        fetch: async (input) =>
          Response.json({
            ok: true,
            result: String(input).endsWith("getUserProfilePhotos")
              ? { photos: [[{ file_id: "x" }]] }
              : { file_path: "../secret" },
          }),
      },
      "1001",
    );
    expect(unsafe).toBeUndefined();
  });
});
