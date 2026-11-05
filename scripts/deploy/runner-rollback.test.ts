import { describe, expect, test } from "bun:test";

import { fake, legacy, request } from "./runner.fixtures.ts";
import { runDeployment } from "./runner.ts";

describe("staged deployment runner-rollback", () => {
  test("production failure restores and verifies exact additive legacy baseline", async () => {
    const f = fake({ baselineFirebase: legacy, productionBad: true });
    const result = await runDeployment(
      { ...request, preflight: { ...request.preflight, intent: { mode: "disable" } } },
      f.ports,
    );
    expect(result).toEqual({ ok: false, error: "production-failed-rolled-back" });
    expect(f.calls.slice(-3)).toEqual([
      "promote:baseline",
      "snapshot:7",
      "probe:production:baseline",
    ]);
  });
  test("rollback verification failure is explicit", async () => {
    const f = fake({ productionBad: true, rollbackBad: true });
    expect(await runDeployment(request, f.ports)).toEqual({ ok: false, error: "rollback-failed" });
  });
  test("uncertain promotion failure also attempts exact rollback", async () => {
    const f = fake({ fail: "promote:candidate" });
    expect(await runDeployment(request, f.ports)).toEqual({
      ok: false,
      error: "promotion-uncertain-rolled-back",
    });
    expect(f.calls).toContain("promote:baseline");
  });
  test("rollback requires exact baseline identity and successful promotion", async () => {
    const wrong = fake({ productionBad: true, rollbackIdentityBad: true });
    expect(await runDeployment(request, wrong.ports)).toEqual({
      ok: false,
      error: "rollback-failed",
    });
    const failed = fake({ productionBad: true, fail: "promote:baseline" });
    expect(await runDeployment(request, failed.ports)).toEqual({
      ok: false,
      error: "rollback-failed",
    });
  });
  test("production snapshot transport failure triggers verified rollback", async () => {
    const f = fake({ fail: "snapshot:5" });
    expect(await runDeployment(request, f.ports)).toEqual({
      ok: false,
      error: "production-failed-rolled-back",
    });
  });
  test("promotion exception triggers verified rollback", async () => {
    const f = fake({ throwAt: "promote:candidate" });
    expect(await runDeployment(request, f.ports)).toEqual({
      ok: false,
      error: "promotion-uncertain-rolled-back",
    });
  });
});
