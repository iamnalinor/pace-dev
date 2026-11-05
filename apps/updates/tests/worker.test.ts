import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import worker from "../src/worker.ts";

const headers = {
  "expo-protocol-version": "1",
  "expo-platform": "android",
  "expo-runtime-version": "unpublished-runtime",
  "expo-channel-name": "preview",
  accept: "multipart/mixed,application/expo+json,application/json",
};

describe("isolated update publisher", () => {
  it("returns a protocol no-update for an unpublished runtime", async () => {
    const response = await worker.fetch(
      new Request("https://updates.test/manifest", { headers }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("expo-protocol-version")).toBe("1");
    expect(await response.text()).toBe("");
  });

  it("rejects writes through the public service", async () => {
    const response = await worker.fetch(
      new Request("https://updates.test/manifest", { method: "POST", headers }),
      env,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("rejects incompatible platforms and unsafe channel names", async () => {
    for (const invalid of [
      { "expo-platform": "ios" },
      { "expo-channel-name": "../stable" },
      { "expo-channel-name": "Preview" },
      { "expo-channel-name": "foo_bar" },
    ]) {
      const response = await worker.fetch(
        new Request("https://updates.test/manifest", { headers: { ...headers, ...invalid } }),
        env,
      );
      expect(response.status).toBe(400);
    }
  });

  it("never exposes release records or channel pointers", async () => {
    const response = await worker.fetch(
      new Request("https://updates.test/channels/runtime/preview.json"),
      env,
    );
    expect(response.status).toBe(404);
  });
});
