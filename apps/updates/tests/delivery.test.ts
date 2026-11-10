import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createReleaseStore } from "../src/r2-store.ts";
import worker from "../src/worker.ts";
import { publishFixture } from "./release.fixture.ts";

const request = (channel: string): Request =>
  new Request("https://updates.test/manifest", {
    headers: {
      "expo-protocol-version": "1",
      "expo-platform": "android",
      "expo-runtime-version": "published-runtime",
      "expo-channel-name": channel,
      accept: "application/expo+json,multipart/mixed",
    },
  });

describe("signed release delivery through R2", () => {
  it("serves the exact promoted signed manifest and immutable asset", async () => {
    const release = await publishFixture(createReleaseStore(env.UPDATES));
    const response = await worker.fetch(request("preview"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("expo-signature")).toBe(release.signatureHeader);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(release.body);
    const asset = await worker.fetch(new Request(`https://updates.test/${release.assetKey}`), env);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("application/javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(await asset.text()).toBe("test executable bundle");
    expect((await worker.fetch(request("production"), env)).status).toBe(204);
  });

  it("reports corrupt channel storage as unavailable instead of no update", async () => {
    await env.UPDATES.put("channels/published-runtime/broken.json", "corrupt");
    const response = await worker.fetch(request("broken"), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "updates/unavailable" });
  });
});
