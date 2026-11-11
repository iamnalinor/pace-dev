import { expect, test } from "bun:test";
import { createHash, X509Certificate } from "node:crypto";

import { collectNativeRuntime, type RuntimeCollectorPorts } from "./native-runtime-collector.ts";

const hash = "a".repeat(40);
const sources = [
  { type: "contents", id: "expoConfig", hash },
  { type: "dir", filePath: "modules/pace-native/android", hash },
  { type: "contents", id: "expoAutolinkingConfig:android", hash },
  { type: "contents", id: "rncoreAutolinkingConfig:android", hash },
  { type: "file", filePath: "ota/publisher-certificate.pem", hash },
];
const certificate = new Uint8Array(
  await Bun.file(new URL("fixtures/public-certificate.pem", import.meta.url)).arrayBuffer(),
);
const config = {
  version: "1.2.3",
  android: { package: "dev.pace.app", versionCode: 10_203_000 },
  runtimeVersion: { policy: "fingerprint" },
  updates: {
    enabled: true,
    url: "https://updates.example/manifest",
    requestHeaders: { "expo-channel-name": "production" },
    codeSigningCertificate: "./ota/publisher-certificate.pem",
    codeSigningMetadata: { alg: "rsa-v1_5-sha256", keyid: "root" },
  },
};
const input = {
  projectRoot: "/fixture/app",
  environment: { PACE_RELEASE_TAG: "v1.2.3", PATH: "/fixture/bin" },
};
const fixture = () => {
  const state = {
    config: JSON.stringify(config),
    fingerprint: JSON.stringify({ hash, sources }),
    exitCode: 0,
  };
  const calls: Parameters<RuntimeCollectorPorts["run"]>[0][] = [];
  const reads: string[] = [];
  const ports: RuntimeCollectorPorts = {
    bunVersion: "1.4.2",
    run: async (command) => {
      calls.push(command);
      await Promise.resolve();
      return {
        exitCode: state.exitCode,
        stdout: command.args.includes("fingerprint:generate") ? state.fingerprint : state.config,
      };
    },
    read: async (path) => {
      reads.push(path);
      await Promise.resolve();
      return certificate;
    },
  };
  return { state, calls, reads, ports };
};

test("collects public config and canonical SDK fingerprint under the same explicit release environment", async () => {
  const { ports, calls, reads } = fixture();
  const result = await collectNativeRuntime(input, ports);
  expect(result).toMatchObject({
    ok: true,
    value: {
      format: 1,
      platform: "android",
      releaseTag: "v1.2.3",
      nativeVersion: "1.2.3",
      versionCode: 10_203_000,
      fingerprint: hash,
      bunVersion: "1.4.2",
      ota: {
        isEnabled: true,
        trust: {
          certificateSha256: createHash("sha256")
            .update(new X509Certificate(certificate).raw)
            .digest("hex"),
        },
      },
    },
  });
  expect(calls.map((call) => call.args)).toEqual([
    ["config", "--type", "public", "--json"],
    ["fingerprint:generate", "--platform", "android"],
  ]);
  expect(calls[0]?.environment).toEqual({ ...input.environment, EXPO_NO_DOTENV: "1", CI: "1" });
  expect(calls[1]?.environment).toEqual(calls[0]?.environment);
  expect(reads).toEqual(["/fixture/app/ota/publisher-certificate.pem"]);
});

test("records disabled APKs with actual fingerprints and no invented certificate trust", async () => {
  const { state, ports, reads } = fixture();
  state.config = JSON.stringify({ ...config, updates: { enabled: false } });
  state.fingerprint = JSON.stringify({
    hash,
    sources: sources.filter((source) => source.type !== "file"),
  });
  expect(await collectNativeRuntime(input, ports)).toMatchObject({
    ok: true,
    value: { fingerprint: hash, ota: { isEnabled: false, trust: null } },
  });
  expect(reads).toEqual([]);
});

test.each([undefined, "", "main", "v1.2.3-dev.1"])(
  "refuses a missing or invalid explicit release tag before executing tools: %s",
  async (releaseTag) => {
    const { ports, calls } = fixture();
    expect(
      (
        await collectNativeRuntime(
          { ...input, environment: { PACE_RELEASE_TAG: releaseTag } },
          ports,
        )
      ).ok,
    ).toBe(false);
    expect(calls).toEqual([]);
  },
);

test.each(["", "not-json", "{}"])(
  "fails closed on empty, invalid or malformed config JSON: %s",
  async (output) => {
    const { ports, state } = fixture();
    state.config = output;
    expect(await collectNativeRuntime(input, ports)).toEqual({
      ok: false,
      error: "config-invalid",
    });
  },
);

test("rejects tool exit failure and incomplete fingerprint sources", async () => {
  const { ports, state } = fixture();
  state.exitCode = 1;
  expect(await collectNativeRuntime(input, ports)).toEqual({
    ok: false,
    error: "config-unavailable",
  });
  state.exitCode = 0;
  state.fingerprint = JSON.stringify({ hash, sources: [] });
  expect(await collectNativeRuntime(input, ports)).toEqual({
    ok: false,
    error: "fingerprint-incomplete",
  });
});

test.each([
  { runtimeVersion: "manual-runtime" },
  { version: "1.2.4" },
  { updates: { ...config.updates, codeSigningCertificate: "../private-key.pem" } },
  { updates: { ...config.updates, codeSigningMetadata: { alg: "other", keyid: "root" } } },
])("rejects incoherent native config without reading caller-selected files: %j", async (change) => {
  const { ports, state, reads } = fixture();
  state.config = JSON.stringify({ ...config, ...change });
  expect((await collectNativeRuntime(input, ports)).ok).toBe(false);
  expect(reads).toEqual([]);
});

test("sanitizes certificate and process exceptions", async () => {
  const { ports } = fixture();
  expect(
    await collectNativeRuntime(input, {
      ...ports,
      read: async () => {
        await Promise.resolve();
        throw new Error("private certificate path");
      },
    }),
  ).toEqual({ ok: false, error: "certificate-unavailable" });
  expect(
    await collectNativeRuntime(input, {
      ...ports,
      run: async () => {
        await Promise.resolve();
        throw new Error("environment-secret");
      },
    }),
  ).toEqual({ ok: false, error: "config-unavailable" });
});
