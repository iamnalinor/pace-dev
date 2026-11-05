import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { PROTOCOL_HEADER } from "@pace/core";

import { fcmTargetOf } from "../src/shared/fcm.ts";
import { pushConfigOf, transportFor } from "../src/shared/push/registry.ts";
import worker from "../src/worker.ts";
import { readJson } from "./helpers.ts";

const ACCOUNT = JSON.stringify({
  client_email: "private@example.test",
  private_key: "private-key",
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
      api_key: [{ current_key: "public-key" }],
    },
  ],
});
const request = async (
  bindings: Partial<Cloudflare.Env>,
  path = "/api/health",
  init?: RequestInit,
): Promise<Response> => {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://pace-api.test${path}`, init),
    { ...env, ...bindings },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
};
const invalidPairs = [
  { android: "", account: ACCOUNT, reason: "missing-android-config" },
  { android: ANDROID, account: "", reason: "missing-service-account" },
  { android: "{private-android", account: ACCOUNT, reason: "android-config-not-json" },
  { android: "null", account: ACCOUNT, reason: "android-config-invalid" },
  { android: ANDROID, account: "{private-account", reason: "invalid-service-account" },
  { android: ANDROID, account: "{}", reason: "invalid-service-account" },
  {
    android: ANDROID.replace('"project"', '"other"'),
    account: ACCOUNT,
    reason: "project-mismatch",
  },
  {
    android: JSON.stringify({
      project_info: { project_id: "project", project_number: "123" },
      client: [],
    }),
    account: ACCOUNT,
    reason: "no-android-clients",
  },
  {
    android: JSON.stringify({
      project_info: { project_id: "project", project_number: "123" },
      client: [1, 2].map(() => ({
        client_info: {
          android_client_info: { package_name: "app.test" },
          mobilesdk_app_id: "app-id",
        },
        api_key: [{ current_key: "public-key" }],
      })),
    }),
    account: ACCOUNT,
    reason: "duplicate-android-package",
  },
];

describe("Firebase strict policy", () => {
  it.each(invalidPairs)(
    "refuses every API surface with a sanitized $reason before protocol or authentication",
    async ({ android, account, reason }) => {
      const bindings = {
        FIREBASE_ANDROID_CONFIG: android,
        FIREBASE_SERVICE_ACCOUNT: account,
        PACE_FIREBASE_CONFIG_POLICY: "strict",
      };
      for (const path of [
        "/api/health",
        "/api/instance",
        "/api/auth/dev",
        "/api/me",
        "/api/sync/pull",
        "/api/not-a-route",
      ]) {
        const response = await request(bindings, path, {
          headers: { Origin: env.WEB_ORIGIN, [PROTOCOL_HEADER]: "0" },
        });
        expect(response.status).toBe(500);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(env.WEB_ORIGIN);
        expect(await readJson(response)).toEqual({
          code: "server/misconfigured",
          message: "Server configuration is invalid",
          reason,
        });
      }
      expect(fcmTargetOf(bindings)).toBeNull();
      expect(transportFor(pushConfigOf(bindings), "fcm")).toBeNull();
    },
  );

  it.each(["unknown", "", "STRICT"])(
    "fails closed for an unknown supplied policy %s",
    async (policy) => {
      const bindings = {
        PACE_FIREBASE_CONFIG_POLICY: policy,
        FIREBASE_SERVICE_ACCOUNT: ACCOUNT,
        FIREBASE_ANDROID_CONFIG: ANDROID,
      };
      const response = await request(bindings);
      expect(response.status).toBe(500);
      expect(await readJson(response)).toEqual({
        code: "server/misconfigured",
        message: "Server configuration is invalid",
        reason: "invalid-config-policy",
      });
      expect(fcmTargetOf(bindings)).toBeNull();
      expect(transportFor(pushConfigOf(bindings), "fcm")).toBeNull();
    },
  );

  it("keeps preflight and non-API paths available with invalid configuration", async () => {
    const bindings = { PACE_FIREBASE_CONFIG_POLICY: "strict", FIREBASE_SERVICE_ACCOUNT: ACCOUNT };
    const response = await request(bindings, "/api/me", {
      method: "OPTIONS",
      headers: { Origin: env.WEB_ORIGIN, "Access-Control-Request-Method": "GET" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(env.WEB_ORIGIN);
    expect((await request(bindings, "/not-a-route")).status).toBe(404);
  });

  it("recovers between request environments and accepts configured or deliberately disabled strict mode", async () => {
    const bindings = {
      PACE_FIREBASE_CONFIG_POLICY: "strict",
      FIREBASE_SERVICE_ACCOUNT: ACCOUNT,
      FIREBASE_ANDROID_CONFIG: "",
    };
    expect((await request(bindings)).status).toBe(500);
    bindings.FIREBASE_ANDROID_CONFIG = ANDROID;
    expect((await request(bindings)).status).toBe(200);
    const instance = await request(bindings, "/api/instance");
    expect(await readJson(instance)).toMatchObject({
      firebase: { projectId: "project" },
      features: { push: true },
    });
    expect(fcmTargetOf(bindings)?.account.project_id).toBe("project");
    bindings.FIREBASE_SERVICE_ACCOUNT = "";
    bindings.FIREBASE_ANDROID_CONFIG = "";
    expect((await request(bindings)).status).toBe(200);
    expect(await readJson(await request(bindings, "/api/instance"))).toMatchObject({
      firebase: null,
      features: { push: false },
    });
    expect(fcmTargetOf(bindings)).toBeNull();
    expect(transportFor(pushConfigOf(bindings), "fcm")).toBeNull();
  });

  it.each([{}, { PACE_FIREBASE_CONFIG_POLICY: "additive" }])(
    "retains the legacy sender in additive mode %#",
    async (policy) => {
      const bindings = { ...policy, FIREBASE_SERVICE_ACCOUNT: ACCOUNT };
      expect((await request(bindings)).status).toBe(200);
      expect(fcmTargetOf(bindings)?.account.project_id).toBe("project");
    },
  );
});
