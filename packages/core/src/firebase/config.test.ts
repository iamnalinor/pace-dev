import { describe, expect, it } from "vitest";

import {
  parseFirebaseAndroidConfig,
  parseFirebaseServiceAccount,
  validateFirebaseConfig,
} from "./config.ts";

const androidClient = (packageName: string, appId: string, apiKey: string) => ({
  api_key: [{ current_key: apiKey }, { current_key: "unused-key" }],
  client_info: {
    android_client_info: { package_name: packageName },
    mobilesdk_app_id: appId,
  },
  oauth_client: [{ client_id: "unused-oauth-client" }],
});

const googleServices = {
  client: [
    androidClient("app.example.pace", "first-app", "first-key"),
    androidClient("app.example.custom", "second-app", "second-key"),
    { client_info: { mobilesdk_app_id: "not-android" } },
  ],
  project_info: {
    project_id: "pace-test",
    project_number: "123456789",
    storage_bucket: "unused-bucket",
  },
};
const publicConfig = {
  apps: [
    { apiKey: "first-key", appId: "first-app", packageName: "app.example.pace" },
    { apiKey: "second-key", appId: "second-app", packageName: "app.example.custom" },
  ],
  projectId: "pace-test",
  senderId: "123456789",
};

const android = JSON.stringify(googleServices);
const serviceAccount = {
  client_email: "test@example.test",
  private_key: "fixture-private-key",
  private_key_id: "fixture-private-key-id",
  project_id: "pace-test",
};
const account = JSON.stringify(serviceAccount);

describe("parseFirebaseServiceAccount", () => {
  it("reads the existing sender shape with the default token endpoint", () => {
    expect(parseFirebaseServiceAccount(account)).toEqual({
      ok: true,
      value: { ...serviceAccount, token_uri: "https://oauth2.googleapis.com/token" },
    });
  });

  it("returns a fixed reason for an unreadable service account", () => {
    expect(parseFirebaseServiceAccount("{synthetic-private-data")).toEqual({
      error: "invalid-service-account",
      ok: false,
    });
  });
});

describe("parseFirebaseAndroidConfig", () => {
  it("projects all Android packages and only the public values they use", () => {
    expect(parseFirebaseAndroidConfig(android)).toEqual({ ok: true, value: publicConfig });
  });

  it("distinguishes unreadable JSON from JSON with the wrong shape", () => {
    expect(parseFirebaseAndroidConfig("{broken")).toEqual({
      error: "android-config-not-json",
      ok: false,
    });
    expect(parseFirebaseAndroidConfig("null")).toEqual({
      error: "android-config-invalid",
      ok: false,
    });
  });

  it.each([
    { ...googleServices, project_info: { project_id: "pace-test" } },
    { ...googleServices, project_info: { ...googleServices.project_info, project_id: "  " } },
    { ...googleServices, client: [androidClient("", "first-app", "first-key")] },
    { ...googleServices, client: [androidClient("app.example.pace", "  ", "first-key")] },
    { ...googleServices, client: [androidClient("app.example.pace", "first-app", "\t")] },
    {
      ...googleServices,
      client: [{ ...androidClient("app.example.pace", "first-app", "first-key"), api_key: [] }],
    },
  ])("rejects an Android config with a missing or blank required field (%#)", (value) => {
    expect(parseFirebaseAndroidConfig(JSON.stringify(value))).toEqual({
      error: "android-config-invalid",
      ok: false,
    });
  });

  it.each([
    { project_info: googleServices.project_info },
    { ...googleServices, client: [] },
    { ...googleServices, client: [{ client_info: { mobilesdk_app_id: "not-android" } }] },
  ])("reports when the file has no Android clients (%#)", (value) => {
    expect(parseFirebaseAndroidConfig(JSON.stringify(value))).toEqual({
      error: "no-android-clients",
      ok: false,
    });
  });

  it("rejects duplicate package entries instead of choosing an app arbitrarily", () => {
    const ambiguous = {
      ...googleServices,
      client: [
        ...googleServices.client,
        androidClient("app.example.pace", "other-app", "other-key"),
      ],
    };
    expect(parseFirebaseAndroidConfig(JSON.stringify(ambiguous))).toEqual({
      error: "duplicate-android-package",
      ok: false,
    });
  });
});

describe("validateFirebaseConfig", () => {
  it("returns only public config for a matching pair", () => {
    expect(
      validateFirebaseConfig({
        FIREBASE_ANDROID_CONFIG: android,
        FIREBASE_SERVICE_ACCOUNT: account,
      }),
    ).toEqual({ ok: true, value: publicConfig });
  });

  it("treats absent bindings and empty strings as push intentionally off", () => {
    expect(validateFirebaseConfig({})).toEqual({ ok: true, value: null });
    expect(
      validateFirebaseConfig({ FIREBASE_ANDROID_CONFIG: "", FIREBASE_SERVICE_ACCOUNT: "" }),
    ).toEqual({ ok: true, value: null });
  });

  it("strictly rejects either partial pair, including a legacy sender-only setup", () => {
    expect(validateFirebaseConfig({ FIREBASE_ANDROID_CONFIG: android })).toEqual({
      error: "missing-service-account",
      ok: false,
    });
    expect(
      validateFirebaseConfig({ FIREBASE_ANDROID_CONFIG: "", FIREBASE_SERVICE_ACCOUNT: account }),
    ).toEqual({ error: "missing-android-config", ok: false });
  });

  it("preserves the Android parser's typed reason", () => {
    expect(
      validateFirebaseConfig({ FIREBASE_ANDROID_CONFIG: "{", FIREBASE_SERVICE_ACCOUNT: account }),
    ).toEqual({ error: "android-config-not-json", ok: false });
  });

  it.each([
    "{",
    "{}",
    JSON.stringify({ ...serviceAccount, client_email: " " }),
    JSON.stringify({ ...serviceAccount, private_key: " " }),
    JSON.stringify({ ...serviceAccount, project_id: " " }),
    JSON.stringify({ ...serviceAccount, token_uri: "not-a-url" }),
  ])("rejects an unreadable or incomplete service account (%#)", (raw) => {
    expect(
      validateFirebaseConfig({ FIREBASE_ANDROID_CONFIG: android, FIREBASE_SERVICE_ACCOUNT: raw }),
    ).toEqual({ error: "invalid-service-account", ok: false });
  });

  it("rejects projects that do not match", () => {
    const otherAccount = JSON.stringify({ ...serviceAccount, project_id: "other-project" });
    expect(
      validateFirebaseConfig({
        FIREBASE_ANDROID_CONFIG: android,
        FIREBASE_SERVICE_ACCOUNT: otherAccount,
      }),
    ).toEqual({ error: "project-mismatch", ok: false });
  });
});
