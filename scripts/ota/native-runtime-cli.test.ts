import { expect, test } from "bun:test";

import { err, ok } from "@pace/core";

import type { NativeRuntimeRecord } from "./native-runtime.ts";

import { runNativeRuntimeCli, type RuntimeCliPorts } from "./native-runtime-cli.ts";

const record: NativeRuntimeRecord = {
  format: 1,
  platform: "android",
  packageId: "dev.pace.app",
  releaseTag: "v1.2.3",
  nativeVersion: "1.2.3",
  versionCode: 10_203_000,
  fingerprint: "a".repeat(40),
  bunVersion: "1.4.2",
  ota: {
    isEnabled: true,
    trust: {
      publisherUrl: "https://updates.example/manifest",
      channel: "production",
      keyId: "root",
      certificateSha256: "b".repeat(64),
    },
  },
};
const input = { projectRoot: "/fixture/app", environment: { PACE_RELEASE_TAG: "v1.2.3" } };
const fixture = () => {
  const files = new Map([["record.json", JSON.stringify(record)]]);
  const state = { collected: 0, candidate: record };
  const ports: RuntimeCliPorts = {
    collect: async () => {
      state.collected += 1;
      await Promise.resolve();
      return ok(state.candidate);
    },
    read: async (file) => {
      await Promise.resolve();
      const content = files.get(file);
      if (content === undefined) {
        throw new Error("private path");
      }
      return content;
    },
    writeExclusive: async (file, content) => {
      await Promise.resolve();
      if (files.has(file)) {
        throw new Error("exists");
      }
      files.set(file, content);
    },
  };
  return { files, state, ports };
};

test("records actual collector metadata as JSON, not an APK-provenance claim", async () => {
  const { ports, state } = fixture();
  const result = await runNativeRuntimeCli(["record"], input, ports);
  expect(result).toEqual(ok(`${JSON.stringify(record)}\n`));
  expect(state.collected).toBe(1);
});

test("writes an explicit exclusive output without replacing existing records", async () => {
  const { ports, files } = fixture();
  expect(await runNativeRuntimeCli(["record", "--output", "new.json"], input, ports)).toEqual(
    ok("record-written\n"),
  );
  expect(files.get("new.json")).toBe(`${JSON.stringify(record)}\n`);
  expect(await runNativeRuntimeCli(["record", "--output", "record.json"], input, ports)).toEqual(
    err("output-failed"),
  );
  expect(files.get("record.json")).toBe(JSON.stringify(record));
});

test("verifies a validated record against newly collected candidate evidence", async () => {
  const { ports, state } = fixture();
  expect(await runNativeRuntimeCli(["verify", "--record", "record.json"], input, ports)).toEqual(
    ok("compatible\n"),
  );
  state.candidate = { ...record, fingerprint: "c".repeat(40) };
  expect(await runNativeRuntimeCli(["verify", "--record", "record.json"], input, ports)).toEqual(
    err("fingerprint-mismatch"),
  );
});

test.each(
  [
    [],
    ["unknown"],
    ["record", "--hash", "caller-hash"],
    ["record", "--record", "record.json"],
    ["verify"],
    ["verify", "--record"],
    ["verify", "--record", "record.json", "--output", "out.json"],
    ["record", "--project", "one", "--project", "two"],
  ].map((args) => ({ args })),
)("rejects invalid arguments before collecting: %j", async ({ args }) => {
  const { ports, state } = fixture();
  expect(await runNativeRuntimeCli(args, input, ports)).toEqual(err("arguments-invalid"));
  expect(state.collected).toBe(0);
});

test("sanitizes missing/malformed/disabled records before invoking tools", async () => {
  const { ports, files, state } = fixture();
  expect(await runNativeRuntimeCli(["verify", "--record", "missing"], input, ports)).toEqual(
    err("record-unavailable"),
  );
  files.set("record.json", "private invalid JSON");
  expect(await runNativeRuntimeCli(["verify", "--record", "record.json"], input, ports)).toEqual(
    err("record-invalid"),
  );
  files.set("record.json", JSON.stringify({ ...record, ota: { isEnabled: false, trust: null } }));
  expect(await runNativeRuntimeCli(["verify", "--record", "record.json"], input, ports)).toEqual(
    err("ota-disabled"),
  );
  expect(state.collected).toBe(0);
});

test("propagates only fixed collector errors", async () => {
  const { ports } = fixture();
  expect(
    await runNativeRuntimeCli(["record"], input, {
      ...ports,
      collect: async () => {
        await Promise.resolve();
        return err("fingerprint-incomplete");
      },
    }),
  ).toEqual(err("fingerprint-incomplete"));
});
