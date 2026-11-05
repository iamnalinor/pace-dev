import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import {
  CLIENT_OUTDATED,
  endpoints,
  MIN_CLIENT_PROTOCOL,
  PROTOCOL,
  PROTOCOL_HEADER,
} from "@pace/core";

import worker from "../src/worker.ts";
import { answerOf, api, call, loginAsDev, readJson } from "./helpers.ts";

/** Calls as an app older than the server serves would make them. */
const OUTDATED = { headers: { [PROTOCOL_HEADER]: "0" } };

const PROJECT = "instance-test";
const PUBLIC_FIREBASE = {
  apps: [{ apiKey: "public-key", appId: "android-app", packageName: "app.example.custom" }],
  projectId: PROJECT,
  senderId: "123456789",
};
const ANDROID_CONFIG = JSON.stringify({
  client: [
    {
      api_key: [{ current_key: "public-key" }],
      client_info: {
        android_client_info: { package_name: "app.example.custom" },
        mobilesdk_app_id: "android-app",
      },
    },
  ],
  project_info: {
    project_id: PROJECT,
    project_number: "123456789",
    storage_bucket: "unused-android-json-field",
  },
});
const PRIVATE_KEY = "synthetic-private-service-account-key";
const ACCOUNT_EMAIL = "synthetic-account@example.test";
const SERVICE_ACCOUNT = JSON.stringify({
  client_email: ACCOUNT_EMAIL,
  private_key: PRIVATE_KEY,
  project_id: PROJECT,
});

const withFirebase =
  (bindings: Partial<Cloudflare.Env>) =>
  async (path: string, init?: RequestInit): Promise<Response> => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`https://pace-api.test${path}`, init),
      { ...env, ...bindings },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
  };

describe("GET /api/instance", () => {
  it("says what this server is, without a token", async () => {
    const instance = await answerOf(endpoints.instance, "/api/instance");
    expect(instance).toEqual({
      apiOrigin: env.API_ORIGIN,
      botUsername: env.TELEGRAM_BOT_USERNAME,
      // The test Worker answers from its built-in fake model (LLM_PROVIDER=fake).
      features: { assistant: true, mcp: true, push: false },
      firebase: null,
      loginMethods: ["telegram-widget", "telegram-deeplink"],
      minClientProtocol: MIN_CLIENT_PROTOCOL,
      name: "Pace",
      protocol: PROTOCOL,
      version: "dev",
      webOrigin: env.WEB_ORIGIN,
    });
  });

  it("publishes only public Android metadata for a matching pair", async () => {
    const fetchWith = withFirebase({
      FIREBASE_ANDROID_CONFIG: ANDROID_CONFIG,
      FIREBASE_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
    });
    const response = await fetchWith("/api/instance");
    expect(response.status).toBe(200);
    const raw = await readJson<Record<string, unknown>>(response);
    expect(raw["firebase"]).toEqual(PUBLIC_FIREBASE);
    expect(endpoints.instance.output.parse(raw)).toMatchObject({
      features: { push: true },
      firebase: PUBLIC_FIREBASE,
    });
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(PRIVATE_KEY);
    expect(serialized).not.toContain(ACCOUNT_EMAIL);
    expect(serialized).not.toContain("unused-android-json-field");
  });

  it.each([
    {
      android: "",
      reason: null,
      sender: SERVICE_ACCOUNT,
    },
    {
      android: "{synthetic-malformed-client-json",
      reason: "android-config-not-json",
      sender: SERVICE_ACCOUNT,
    },
    {
      android: ANDROID_CONFIG.replace(PROJECT, "other-project"),
      reason: "project-mismatch",
      sender: SERVICE_ACCOUNT,
    },
    {
      android: ANDROID_CONFIG,
      reason: "missing-service-account",
      sender: "",
    },
    {
      android: ANDROID_CONFIG,
      reason: "invalid-service-account",
      sender: "{synthetic-malformed-account-json",
    },
  ])(
    "keeps the API available with null metadata ($reason)",
    async ({ android, reason, sender }) => {
      const fetchWith = withFirebase({
        FIREBASE_ANDROID_CONFIG: android,
        FIREBASE_SERVICE_ACCOUNT: sender,
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const response = await fetchWith("/api/instance");
        expect(response.status).toBe(200);
        const raw = await readJson<Record<string, unknown>>(response);
        const isFcmAvailable = sender === SERVICE_ACCOUNT;
        expect(raw["firebase"]).toBeNull();
        expect(endpoints.instance.output.parse(raw).features.push).toBe(isFcmAvailable);
        const time = expect.any(String) as unknown;
        const warnings =
          reason === null
            ? []
            : [
                {
                  level: "warn",
                  message: "Firebase Android metadata is unavailable",
                  reason,
                  time,
                },
              ];
        expect(warn.mock.calls.map((args) => JSON.parse(String(args[0])) as unknown)).toEqual(
          warnings,
        );

        const health = await fetchWith("/api/health");
        expect(health.status).toBe(200);
        expect(endpoints.health.output.parse(await readJson(health))).toEqual({ status: "ok" });
        const token = await loginAsDev("1001");
        const headers = { Authorization: `Bearer ${token}` };
        expect((await fetchWith("/api/me", { headers })).status).toBe(200);
        const registration = await fetchWith("/api/push/subscription", {
          // Older APKs do not send a project id; registration still uses the sender account.
          body: JSON.stringify({ endpoint: "legacy-fcm-token", method: "fcm" }),
          headers: { ...headers, "Content-Type": "application/json" },
          method: "PUT",
        });
        expect(registration.status).toBe(isFcmAvailable ? 200 : 409);
        expect(await readJson(registration)).toMatchObject(
          isFcmAvailable ? { method: "fcm" } : { code: "push/method-unavailable" },
        );
      } finally {
        warn.mockRestore();
      }
    },
  );
});

describe(`the ${PROTOCOL_HEADER} header`, () => {
  it("refuses an app older than the server serves, with a code the app can act on", async () => {
    const token = await loginAsDev("1001");
    const response = await call("/api/me", { token, ...OUTDATED });
    expect(response.status).toBe(426);
    expect(await readJson<{ code: string }>(response)).toMatchObject({ code: CLIENT_OUTDATED });
  });

  it("refuses before asking for a token, and the web app can read the refusal", async () => {
    const response = await call("/api/me", {
      headers: { Origin: env.WEB_ORIGIN, [PROTOCOL_HEADER]: "0" },
    });
    expect(response.status).toBe(426);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(env.WEB_ORIGIN);
  });

  it("serves the current protocol, no header at all (an older app) and an unreadable one", async () => {
    const token = await loginAsDev("1001");
    for (const headers of [
      { [PROTOCOL_HEADER]: String(PROTOCOL) },
      {},
      { [PROTOCOL_HEADER]: "abc" },
    ]) {
      expect((await call("/api/me", { headers, token })).status).toBe(200);
    }
  });

  it("never refuses the calls an outdated app needs to learn why", async () => {
    expect((await call("/api/instance", OUTDATED)).status).toBe(200);
    expect((await call("/api/health", OUTDATED)).status).toBe(200);
  });

  it("is a header the web app may send", async () => {
    const response = await api.fetch(
      new Request("https://pace-api.test/api/me", {
        headers: {
          "Access-Control-Request-Headers": `authorization, ${PROTOCOL_HEADER.toLowerCase()}`,
          "Access-Control-Request-Method": "GET",
          Origin: env.WEB_ORIGIN,
        },
        method: "OPTIONS",
      }),
    );
    const allowed = (response.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase();
    expect(allowed.split(/,\s*/u)).toContain(PROTOCOL_HEADER.toLowerCase());
  });

  it("refuses an outdated app's live socket (a socket cannot carry the header: it is in the address)", async () => {
    const token = await loginAsDev("1001");
    const response = await api.fetch(
      new Request("https://pace-api.test/api/sync/live?device=phone-1&protocol=0", {
        headers: { "Sec-WebSocket-Protocol": `pace.v1, pace.auth.${token}`, Upgrade: "websocket" },
      }),
    );
    expect(response.status).toBe(426);
    expect(await readJson<{ code: string }>(response)).toMatchObject({ code: CLIENT_OUTDATED });
  });
});
