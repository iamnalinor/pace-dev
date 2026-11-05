import { describe, expect, test } from "bun:test";

import { parseControlPlaneSnapshot, preflight } from "./preflight.ts";
import { verifyReadiness } from "./verification.ts";

const ready = {
  identity: { status: "available", versionId: "baseline", attempt: "old" },
  policy: "additive",
  firebase: { verdict: "ready", mode: "disabled" },
};
const snapshot = {
  status: "existing" as const,
  accountId: "account",
  workerName: "worker",
  active: [{ versionId: "baseline", percentage: 100 }],
  latestVersionId: "baseline",
  deploymentId: "deployment",
};
const request = {
  accountId: "account",
  workerName: "worker",
  expectedSha: "a".repeat(40),
  checkout: { sha: "a".repeat(40), clean: true },
  attempt: "run-123",
  usedAttempts: ["old"],
  policy: "strict" as const,
  intent: { mode: "keep" as const },
};

describe("deployment preflight", () => {
  test("keeps a verified remote pair", () => {
    expect(preflight(request, snapshot, ready)).toMatchObject({
      ok: true,
      value: { versionId: "baseline", expectedPair: { mode: "disabled" } },
    });
  });
  test.each([
    { ...request, checkout: { ...request.checkout, clean: false } },
    { ...request, checkout: { ...request.checkout, sha: "b".repeat(40) } },
    { ...request, accountId: "other" },
    { ...request, accountId: " account" },
    { ...request, workerName: "worker " },
    { ...request, workerName: "other" },
    { ...request, attempt: "old" },
    { ...request, attempt: " " },
    { ...request, attempt: "old", usedAttempts: [] },
    { ...request, expectedSha: "HEAD" },
  ])("rejects unsafe request %#", (input) => {
    expect(preflight(input, snapshot, ready).ok).toBe(false);
  });
  test.each([
    { ...snapshot, active: [] },
    {
      ...snapshot,
      active: [
        { versionId: "baseline", percentage: 50 },
        { versionId: "other", percentage: 50 },
      ],
    },
    { ...snapshot, latestVersionId: "drift" },
    { status: "absent" as const, accountId: "account", workerName: "worker" },
  ])("rejects unsafe control plane %#", (input) => {
    expect(preflight(request, input, ready).ok).toBe(false);
  });
  test.each([
    null,
    {},
    { status: "absent", error: "unauthorized" },
    { status: "existing" },
    { ...snapshot, active: [{ versionId: "baseline", percentage: "100" }] },
  ])("rejects malformed authenticated payload %#", (input) => {
    expect(parseControlPlaneSnapshot(input).ok).toBe(false);
  });
  test("checks absent target before explicit bootstrap refusal", () => {
    expect(
      preflight(request, { status: "absent", accountId: "wrong", workerName: "worker" }, ready),
    ).toEqual({ ok: false, error: "target-mismatch" });
  });
  test("accepts authenticated confirmed absence only in parser", () => {
    expect(
      parseControlPlaneSnapshot({ status: "absent", accountId: "account", workerName: "worker" }),
    ).toEqual({
      ok: true,
      value: { status: "absent", accountId: "account", workerName: "worker" },
    });
  });
  test("disable expects disabled while preserving rollback pair", () => {
    const configured = {
      ...ready,
      firebase: { verdict: "ready", mode: "configured", projectId: "project" },
    };
    expect(
      preflight({ ...request, intent: { mode: "disable" } }, snapshot, configured),
    ).toMatchObject({
      ok: true,
      value: {
        firebase: { verdict: "ready", mode: "configured", projectId: "project" },
        expectedPair: { mode: "disabled" },
      },
    });
  });
  test("configure returns only public project identity", () => {
    const androidConfig = JSON.stringify({
      project_info: { project_id: "project", project_number: "123" },
      client: [
        {
          api_key: [{ current_key: "SECRET_API_KEY" }],
          client_info: {
            mobilesdk_app_id: "app",
            android_client_info: { package_name: "test.app" },
          },
        },
      ],
    });
    const serviceAccount = JSON.stringify({
      project_id: "project",
      client_email: "SECRET_EMAIL",
      private_key: "SECRET_PRIVATE_KEY",
    });
    const result = preflight(
      { ...request, intent: { mode: "configure", androidConfig, serviceAccount } },
      snapshot,
      ready,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { expectedPair: { mode: "configured", projectId: "project" } },
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    const mismatch = preflight(
      {
        ...request,
        intent: {
          mode: "configure",
          androidConfig,
          serviceAccount: serviceAccount.replace('"project"', '"different"'),
        },
      },
      snapshot,
      ready,
    );
    expect(mismatch).toEqual({ ok: false, error: "invalid-configure-pair" });
  });
  test("explicit disable can replace additive legacy pair", () => {
    const legacy = { ...ready, firebase: { verdict: "invalid", reason: "missing-android-config" } };
    expect(preflight({ ...request, intent: { mode: "disable" } }, snapshot, legacy)).toMatchObject({
      ok: true,
      value: { firebase: legacy.firebase, expectedPair: { mode: "disabled" } },
    });
    expect(preflight(request, snapshot, legacy)).toEqual({ ok: false, error: "invalid-pair" });
  });
  test.each(["additive", "strict", "invalid", "unknown"])(
    "legacy configure respects baseline policy %s",
    (policy) => {
      const androidConfig = JSON.stringify({
        project_info: { project_id: "project", project_number: "123" },
        client: [
          {
            api_key: [{ current_key: "key" }],
            client_info: {
              mobilesdk_app_id: "app",
              android_client_info: { package_name: "test.app" },
            },
          },
        ],
      });
      const serviceAccount = JSON.stringify({
        project_id: "project",
        client_email: "email",
        private_key: "key",
      });
      const legacy = {
        ...ready,
        policy,
        firebase: { verdict: "invalid", reason: "missing-android-config" },
      };
      expect(
        preflight(
          { ...request, intent: { mode: "configure", androidConfig, serviceAccount } },
          snapshot,
          legacy,
        ).ok,
      ).toBe(policy === "additive");
      expect(preflight({ ...request, intent: { mode: "disable" } }, snapshot, legacy).ok).toBe(
        policy === "additive",
      );
      expect(preflight(request, snapshot, legacy).ok).toBe(false);
      expect(
        verifyReadiness(legacy, {
          versionId: "baseline",
          attempt: "old",
          policy: "additive",
          pair: { mode: "disabled" },
        }).ok,
      ).toBe(false);
    },
  );
  test("configure rejects missing or malformed pairs without leaking inputs", () => {
    for (const androidConfig of ["", "SECRET_INVALID_JSON"]) {
      const result = preflight(
        { ...request, intent: { mode: "configure", androidConfig, serviceAccount: "SECRET_KEY" } },
        snapshot,
        ready,
      );
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("SECRET");
    }
  });
});

describe("exact readiness verification", () => {
  const expected = {
    versionId: "baseline",
    attempt: "old",
    policy: "additive" as const,
    pair: { mode: "disabled" as const },
  };
  test("accepts exact verified identity and pair", () => {
    expect(verifyReadiness(ready, expected).ok).toBe(true);
  });
  test.each([
    null,
    {},
    { ...ready, identity: { ...ready.identity, versionId: " baseline" } },
    { ...ready, identity: { ...ready.identity, attempt: "old " } },
    { ...ready, identity: { status: "unavailable" } },
    { ...ready, identity: { status: "available", versionId: "baseline" } },
    { ...ready, identity: { ...ready.identity, versionId: "wrong" } },
    { ...ready, identity: { ...ready.identity, attempt: "wrong" } },
    { ...ready, policy: "strict" },
    { ...ready, policy: "invalid" },
    { ...ready, firebase: { verdict: "invalid", reason: "missing-android-config" } },
    { ...ready, firebase: { verdict: "invalid", reason: "future" } },
    { ...ready, firebase: { verdict: "ready", mode: "configured", projectId: "project" } },
  ])("rejects unverifiable readiness %#", (input) => {
    expect(verifyReadiness(input, expected).ok).toBe(false);
  });
  test.each([
    null,
    {},
    { ...ready, identity: { status: "unavailable" } },
    { ...ready, identity: { status: "available", versionId: "baseline" } },
    { ...ready, identity: { ...ready.identity, versionId: "wrong" } },
    { ...ready, policy: "invalid" },
    { ...ready, firebase: { verdict: "invalid", reason: "missing-android-config" } },
    { ...ready, firebase: { verdict: "invalid", reason: "future" } },
  ])("preflight rejects invalid baseline %#", (input) => {
    expect(preflight(request, snapshot, input).ok).toBe(false);
  });
  test.each([
    { ...ready, policy: "strict" },
    { ...ready, identity: { ...ready.identity, attempt: "previous-run" } },
    { ...ready, firebase: { verdict: "ready", mode: "configured", projectId: "project" } },
  ])("preflight derives valid baseline facts %#", (input) => {
    expect(preflight(request, snapshot, input).ok).toBe(true);
  });
  test("compares public project identity", () => {
    expect(
      verifyReadiness(
        { ...ready, firebase: { verdict: "ready", mode: "configured", projectId: "wrong" } },
        { ...expected, pair: { mode: "configured", projectId: "project" } },
      ).ok,
    ).toBe(false);
  });
});
