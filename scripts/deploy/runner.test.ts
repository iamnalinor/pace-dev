import { describe, expect, test } from "bun:test";

import {
  androidConfig,
  configure,
  configured,
  fake,
  legacy,
  request,
  serviceAccount,
} from "./runner.fixtures.ts";
import { runDeployment } from "./runner.ts";

describe("staged deployment runner", () => {
  test("orders baseline proof, inactive verification, migration and exact promotion", async () => {
    const f = fake();
    expect(await runDeployment(request, f.ports)).toEqual({
      ok: true,
      value: { versionId: "candidate", baselineVersionId: "baseline", attempt: "run-123" },
    });
    expect(f.calls).toEqual([
      "snapshot:1",
      "probe:production:baseline",
      "upload",
      "snapshot:2",
      "anonymous",
      "probe:version:candidate",
      "snapshot:3",
      "migrate",
      "snapshot:4",
      "promote:candidate",
      "snapshot:5",
      "probe:production:candidate",
    ]);
  });
  test("configure batches both pair values and other secrets once", async () => {
    const f = fake({ candidateFirebase: configured });
    expect((await runDeployment(configure, f.ports)).ok).toBe(true);
    expect(f.updates).toEqual([
      {
        OTHER: "SECRET_OTHER",
        FIREBASE_ANDROID_CONFIG: androidConfig,
        FIREBASE_SERVICE_ACCOUNT: serviceAccount,
      },
    ]);
    expect(f.calls).toEqual([
      "snapshot:1",
      "probe:production:baseline",
      "upload",
      "snapshot:2",
      "secrets",
      "snapshot:3",
      "anonymous",
      "probe:version:updated",
      "snapshot:4",
      "migrate",
      "snapshot:5",
      "promote:updated",
      "snapshot:6",
      "probe:production:updated",
    ]);
  });
  test("disable replaces additive legacy pair in one null update", async () => {
    const f = fake({ baselineFirebase: legacy });
    const input = {
      ...request,
      preflight: { ...request.preflight, intent: { mode: "disable" as const } },
    };
    expect((await runDeployment(input, f.ports)).ok).toBe(true);
    expect(f.updates).toEqual([{ FIREBASE_ANDROID_CONFIG: null, FIREBASE_SERVICE_ACCOUNT: null }]);
  });
  test("disable skips already absent pair; keep stages other secrets", async () => {
    const f = fake();
    expect(
      (
        await runDeployment(
          { ...request, preflight: { ...request.preflight, intent: { mode: "disable" } } },
          f.ports,
        )
      ).ok,
    ).toBe(true);
    expect(f.updates).toEqual([]);
    const extra = fake();
    expect(
      (await runDeployment({ ...request, otherSecrets: { OTHER: "value" } }, extra.ports)).ok,
    ).toBe(true);
    expect(extra.updates).toEqual([{ OTHER: "value" }]);
  });
  test("no migration declaration skips migrations", async () => {
    const f = fake();
    expect((await runDeployment({ ...request, migrations: { mode: "none" } }, f.ports)).ok).toBe(
      true,
    );
    expect(f.calls).not.toContain("migrate");
  });
});
