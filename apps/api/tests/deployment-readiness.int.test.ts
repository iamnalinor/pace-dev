import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { PROTOCOL_HEADER } from "@pace/core";

import worker from "../src/worker.ts";
import { readJson } from "./helpers.ts";

const VERSION_ID = "c1be9693-171a-4c15-9695-443b86771930";
const ATTEMPT = "staging-test-1";
const ACCOUNT = JSON.stringify({
  client_email: "private@example.test",
  private_key: "private-account-key",
  project_id: "project",
});
const ANDROID = JSON.stringify({
  project_info: { project_id: "project", project_number: "123" },
  client: [
    {
      client_info: {
        android_client_info: { package_name: "app.test" },
        mobilesdk_app_id: "app-id",
      },
      api_key: [{ current_key: "android-api-key" }],
    },
  ],
});

const request = async (
  bindings: Readonly<Record<string, unknown>>,
  path = "/api/deployment-readiness",
) => {
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://pace-api.test${path}`, {
      headers: { [PROTOCOL_HEADER]: "0" },
    }),
    {
      ...env,
      CF_VERSION_METADATA: { id: VERSION_ID, tag: "candidate", timestamp: "2026-11-05T00:00:00Z" },
      PACE_DEPLOY_ATTEMPT: ATTEMPT,
      ...bindings,
    },
    context,
  );
  await waitOnExecutionContext(context);
  return response;
};

describe("deployment readiness", () => {
  it.each(["additive", "strict"])(
    "reports real identity and configured project under %s",
    async (policy) => {
      const response = await request({
        FIREBASE_SERVICE_ACCOUNT: ACCOUNT,
        FIREBASE_ANDROID_CONFIG: ANDROID,
        PACE_FIREBASE_CONFIG_POLICY: policy,
        PACE_VERSION: "not-the-worker-version-id",
      });
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({
        identity: { status: "available", versionId: VERSION_ID, attempt: ATTEMPT },
        policy,
        firebase: { verdict: "ready", mode: "configured", projectId: "project" },
      });
    },
  );

  it("reports deliberate disabled state without authentication or current protocol", async () => {
    const response = await request({ PACE_FIREBASE_CONFIG_POLICY: "strict" });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      firebase: { verdict: "ready", mode: "disabled" },
    });
  });

  it.each([
    { CF_VERSION_METADATA: undefined },
    { CF_VERSION_METADATA: { id: "" } },
    { PACE_DEPLOY_ATTEMPT: undefined },
    { PACE_DEPLOY_ATTEMPT: " ".repeat(3) },
  ])("never invents unavailable identity from build labels: %j", async (bindings) => {
    const response = await request({ ...bindings, PACE_VERSION: VERSION_ID });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ identity: { status: "unavailable" } });
  });

  it.each(["additive", "strict"])(
    "diagnoses partial config under %s without exposing secrets",
    async (policy) => {
      const bindings = { FIREBASE_SERVICE_ACCOUNT: ACCOUNT, PACE_FIREBASE_CONFIG_POLICY: policy };
      const response = await request(bindings);
      expect(response.status).toBe(200);
      const body = await readJson(response);
      expect(body).toMatchObject({
        policy,
        firebase: { verdict: "invalid", reason: "missing-android-config" },
      });
      expect(JSON.stringify(body)).not.toMatch(
        /private@example|private-account-key|android-api-key/,
      );
      expect((await request(bindings, "/api/health")).status).toBe(policy === "strict" ? 500 : 200);
    },
  );

  it("reports invalid policy without making application endpoints available", async () => {
    const bindings = { PACE_FIREBASE_CONFIG_POLICY: "strcit" };
    const response = await request(bindings);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      policy: "invalid",
      firebase: { verdict: "invalid", reason: "invalid-config-policy" },
    });
    expect((await request(bindings, "/api/health")).status).toBe(500);
  });

  it.each([
    { android: ANDROID, account: "", reason: "missing-service-account" },
    { android: "private-invalid-json", account: ACCOUNT, reason: "android-config-not-json" },
    { android: "null", account: ACCOUNT, reason: "android-config-invalid" },
    { android: ANDROID, account: "private-invalid-account", reason: "invalid-service-account" },
    {
      android: ANDROID.replace('"project"', '"other"'),
      account: ACCOUNT,
      reason: "project-mismatch",
    },
  ])(
    "preserves sanitized validator reason $reason under both policies",
    async ({ android, account, reason }) => {
      for (const policy of ["additive", "strict"]) {
        const response = await request({
          FIREBASE_ANDROID_CONFIG: android,
          FIREBASE_SERVICE_ACCOUNT: account,
          PACE_FIREBASE_CONFIG_POLICY: policy,
        });
        expect(response.status).toBe(200);
        const body = await readJson(response);
        expect(body).toMatchObject({ firebase: { verdict: "invalid", reason }, policy });
        expect(JSON.stringify(body)).not.toMatch(/private-|android-api-key|private@example/);
      }
    },
  );

  it("needs no database or authentication to diagnose an inactive candidate", async () => {
    const response = await request({ DB: undefined, USER_STORE: undefined, OAUTH_KV: undefined });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ identity: { status: "available" } });
  });
});
