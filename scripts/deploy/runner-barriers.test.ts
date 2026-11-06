import { describe, expect, test } from "bun:test";

import { configure, configured, fake, legacy, request } from "./runner.fixtures.ts";
import { runDeployment } from "./runner.ts";

describe("staged deployment runner-barriers", () => {
  test.each([
    "snapshot:1",
    "probe:production:baseline",
    "upload",
    "snapshot:2",
    "anonymous",
    "probe:version:candidate",
    "snapshot:3",
    "migrate",
    "snapshot:4",
  ])("stops all following operations after failure at %s", async (fail) => {
    const f = fake({ fail });
    const result = await runDeployment(request, f.ports);
    expect(result.ok).toBe(false);
    expect(f.calls.at(-1)).toBe(fail);
    expect(f.calls).not.toContain("promote:candidate");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  test.each([2, 3, 4])("halts on latest drift at snapshot %i", async (driftAt) => {
    const f = fake({ driftAt });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe(`snapshot:${driftAt}`);
  });
  test.each([200, 302, 404, 500])("requires anonymous denial, rejects %i", async (anonymous) => {
    const f = fake({ anonymous });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe("anonymous");
  });
  test("rejects baseline reused as candidate", async () => {
    const f = fake({ badCandidate: "baseline" });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe("upload");
  });
  test("invalid candidate pair never reaches migrations", async () => {
    const f = fake({ candidateFirebase: legacy });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls).not.toContain("migrate");
  });
  test("port exceptions never leak secret messages", async () => {
    const f = fake({ throwAt: "upload" });
    expect(await runDeployment(request, f.ports)).toEqual({ ok: false, error: "port-failed" });
  });
  test.each([
    { baselineBad: true },
    { candidateBad: true },
    { invalidReadiness: true },
    { malformedUpload: true },
    { activeUpload: true },
    { absent: true },
  ])("rejects incomplete or unhealthy proof %#", async (options) => {
    const f = fake(options);
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls).not.toContain("migrate");
    expect(f.calls).not.toContain("promote:candidate");
  });
  test.each([2, 3, 4])("halts active deployment drift at %i", async (activeDriftAt) => {
    const f = fake({ activeDriftAt });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe(`snapshot:${activeDriftAt}`);
  });
  test.each([2, 3, 4])("halts deployment identity drift at %i", async (deploymentDriftAt) => {
    const f = fake({ deploymentDriftAt });
    expect((await runDeployment(request, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe(`snapshot:${deploymentDriftAt}`);
  });
  test.each(["secrets", "snapshot:3"])("configure stops at update failure %s", async (fail) => {
    const f = fake({ fail, candidateFirebase: configured });
    expect((await runDeployment(configure, f.ports)).ok).toBe(false);
    expect(f.calls.at(-1)).toBe(fail);
  });
  test("invalid request and forbidden secret overrides do no writes", async () => {
    const f = fake();
    expect(
      (
        await runDeployment(
          { ...request, otherSecrets: { FIREBASE_SERVICE_ACCOUNT: "SECRET" } },
          f.ports,
        )
      ).ok,
    ).toBe(false);
    expect(f.calls).toEqual([]);
  });
});
