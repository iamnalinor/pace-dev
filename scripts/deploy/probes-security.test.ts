import { describe, expect, test } from "bun:test";

import { err, ok } from "@pace/core";

import { fixture, json, preview, ready } from "./probes.fixtures.ts";
import { createHttpProbes } from "./probes.ts";

describe("probes-security", () => {
  test.each([
    "https://foreign.example",
    "https://SECRET_ID:SECRET_VALUE@version.example",
    "https://version.example?secret=value",
    "https://version.example#fragment",
    "http://version.example",
    "https://version.example/other",
    "https://version.example/",
    "https://VERSION.example",
  ])("rejects nonexact preview %s before fetch", async (previewUrl) => {
    const f = fixture();
    expect((await f.probes.probe({ ...preview, previewUrl })).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  test.each([
    { ...preview, accountId: "other" },
    { ...preview, workerName: "other" },
    { ...preview, versionId: " " },
  ])("rejects wrong target %#", async (input) => {
    const f = fixture();
    expect((await f.probes.probe(input)).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  test("rejects untrusted resolver output and resolver errors without fetching", async () => {
    const f = fixture();
    const bad = createHttpProbes({
      ...f.config,
      resolveVersionOrigin: async () => ok("https://foreign.example/path"),
    });
    expect((await bad.probe(preview)).ok).toBe(false);
    const thrown = createHttpProbes({
      ...f.config,
      resolveVersionOrigin: async () => {
        throw new Error("SECRET_VALUE");
      },
    });
    expect(await thrown.probe(preview)).toEqual({ ok: false, error: "transport" });
    expect(f.calls).toEqual([]);
  });
  test("preserves unsupported preview capability without HTTP requests", async () => {
    const f = fixture();
    const probes = createHttpProbes({
      ...f.config,
      resolveVersionOrigin: async () => err("unsupported-version-preview"),
    });
    expect(await probes.probe(preview)).toEqual({
      ok: false,
      error: "unsupported-version-preview",
    });
    expect(f.calls).toEqual([]);
  });
  test.each([201, 202, 301, 302, 307, 308, 401, 403, 404, 500])(
    "fails closed for HTTP %i without redirecting",
    async (status) => {
      const f = fixture(async () =>
        Response.json(ready, {
          status,
          headers: { Location: "https://foreign.example/SECRET_VALUE" },
        }),
      );
      const result = await f.probes.probe(preview);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("SECRET");
      expect(f.calls).toHaveLength(1);
    },
  );
  test("rejects an unexpected followed response URL", async () => {
    const f = fixture(async () => {
      const response = json(ready);
      Object.defineProperty(response, "url", {
        value: "https://foreign.example/api/deployment-readiness",
      });
      return response;
    });
    expect((await f.probes.probe(preview)).ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });
  test("rejects empty configured target and oversized response", async () => {
    const f = fixture(async () => new Response("x".repeat(1_048_577)));
    expect((await f.probes.probe(preview)).ok).toBe(false);
    const blankTarget = { accountId: "", workerName: "" };
    const empty = createHttpProbes({ ...f.config, target: blankTarget });
    expect((await empty.probe({ ...blankTarget, kind: "production" })).ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });
});
