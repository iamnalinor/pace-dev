import { describe, expect, test } from "bun:test";

import { PROTOCOL, PROTOCOL_HEADER } from "@pace/core";

import { fixture, json, preview, production, ready } from "./probes.fixtures.ts";

describe("probes", () => {
  test("probes the exact trusted preview with protocol and Access headers", async () => {
    const f = fixture();
    expect(await f.probes.probe(preview)).toEqual({
      ok: true,
      value: { readiness: ready, health: true, instance: true },
    });
    expect(f.calls.map(({ url }) => url)).toEqual([
      "https://version.example/api/deployment-readiness",
      "https://version.example/api/health",
      "https://version.example/api/instance",
    ]);
    for (const { init } of f.calls) {
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get(PROTOCOL_HEADER)).toBe(String(PROTOCOL));
      expect(new Headers(init.headers).get("CF-Access-Client-Secret")).toBe("SECRET_VALUE");
    }
  });
  test("uses configured production origin", async () => {
    const f = fixture();
    expect((await f.probes.probe(production)).ok).toBe(true);
    expect(f.calls.every(({ url }) => url.startsWith("https://production.example/"))).toBe(true);
  });
  test("anonymous denial sends no Access credentials", async () => {
    const f = fixture(async () => new Response(null, { status: 403 }));
    expect(await f.probes.anonymousStatus(preview)).toEqual({ ok: true, value: 403 });
    const headers = new Headers(f.calls[0]?.init.headers);
    expect(headers.has("CF-Access-Client-Id")).toBe(false);
    expect(headers.has("CF-Access-Client-Secret")).toBe(false);
  });
  test.each([
    null,
    {},
    { ...ready, identity: { status: "available", versionId: "different", attempt: "run" } },
    { ...ready, firebase: { verdict: "invalid", reason: "unknown" } },
  ])("rejects malformed or wrong version readiness %#", async (body) => {
    const f = fixture(async () => json(body));
    expect((await f.probes.probe(preview)).ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });
  test.each(["health", "instance"])("validates %s body and status", async (endpoint) => {
    const f = fixture(async (url) => {
      if (url.endsWith(endpoint)) {
        return json({});
      }
      return json(url.endsWith("deployment-readiness") ? ready : { status: "ok" });
    });
    expect((await f.probes.probe(preview)).ok).toBe(false);
  });
  test("rejects whitespace-normalized identity before accepting exact version", async () => {
    const f = fixture(async () =>
      json({ ...ready, identity: { ...ready.identity, versionId: " version" } }),
    );
    expect((await f.probes.probe(preview)).ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });
  test("rejects invalid JSON without returning the body", async () => {
    const f = fixture(async () => new Response("SECRET_VALUE"));
    expect(await f.probes.probe(preview)).toEqual({ ok: false, error: "malformed" });
  });
});
