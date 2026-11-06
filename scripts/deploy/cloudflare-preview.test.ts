import { describe, expect, test } from "bun:test";

import {
  fixture,
  success,
  target,
  version,
  versionId,
  worker,
} from "./cloudflare-read.fixtures.ts";

const json = (value: unknown) => Response.json(success(value));
const responding = (modifiedWorker: unknown, modifiedVersion: unknown) =>
  fixture((url) => {
    if (url.endsWith(`/accounts/${target.accountId}`)) {
      return json({ id: target.accountId });
    }
    return json(url.endsWith(versionId) ? modifiedVersion : modifiedWorker);
  });

describe("authenticated exact Version URL capability", () => {
  test("derives preview only from authenticated suffix and exact preview-capable version", async () => {
    const f = fixture();
    expect(await f.reader.resolveVersionOrigin(target, versionId)).toEqual({
      ok: true,
      value: "https://12345678-pace-worker.owned.workers.dev",
    });
    expect(f.calls.at(-1)?.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/pace-worker/versions/${versionId}`,
    );
  });
  test.each([false, undefined])(
    "unsupported hasPreview %s fails explicitly",
    async (hasPreview) => {
      const f = responding(worker, { ...version, metadata: { hasPreview } });
      expect(await f.reader.resolveVersionOrigin(target, versionId)).toEqual({
        ok: false,
        error: "unsupported-version-preview",
      });
    },
  );
  test("Durable Object metadata fails explicitly even if preview flag is unexpectedly true", async () => {
    const f = responding(worker, {
      ...version,
      resources: { script_runtime: { exports: { Counter: { type: "durable-object" } } } },
    });
    expect(await f.reader.resolveVersionOrigin(target, versionId)).toEqual({
      ok: false,
      error: "unsupported-version-preview",
    });
  });
  test.each([
    { ...worker, subdomain: { ...worker.subdomain, previews_enabled: false } },
    { ...worker, subdomain: { previews_enabled: true } },
    {
      ...worker,
      subdomain: { ...worker.subdomain, preview_url_suffix: "-pace-worker.foreign.example" },
    },
    { ...worker, subdomain: { ...worker.subdomain, preview_url_suffix: "@foreign.example" } },
  ])("rejects disabled or untrusted preview configuration %#", async (metadata) => {
    const f = responding(metadata, version);
    expect((await f.reader.resolveVersionOrigin(target, versionId)).ok).toBe(false);
  });
  test("rejects a different returned version ID", async () => {
    const f = responding(worker, { ...version, id: "87654321-1234-4234-8234-123456789abc" });
    expect((await f.reader.resolveVersionOrigin(target, versionId)).ok).toBe(false);
  });
  test("bounds a stalled fetch and rejects invalid version inputs before dispatch", async () => {
    const f = fixture(async () => await new Promise<Response>(() => undefined), 10);
    expect(await f.reader.readSnapshot(target)).toEqual({ ok: false, error: "transport" });
    const fresh = fixture();
    expect((await fresh.reader.resolveVersionOrigin(target, "../foreign")).ok).toBe(false);
    expect(fresh.calls).toEqual([]);
  });
  test("bounds a never-ending body and prevents credentials on invalid target", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"success":'));
      },
    });
    const f = fixture(() => new Response(body), 10);
    expect(await f.reader.readSnapshot(target)).toEqual({ ok: false, error: "transport" });
    const fresh = fixture();
    expect(
      (await fresh.reader.resolveVersionOrigin({ ...target, accountId: "foreign" }, versionId)).ok,
    ).toBe(false);
    expect(fresh.calls).toEqual([]);
  });
});
