import { createHash, X509Certificate } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import { type NativeFingerprintError, validateNativeFingerprint } from "./native-fingerprint.ts";
import {
  type RuntimeCollectorPorts,
  runtimeCollectorPorts,
  type RuntimeCommand,
} from "./native-runtime-tools.ts";
import { type NativeRuntimeRecord, parseNativeRuntimeRecord } from "./native-runtime.ts";

export type { RuntimeCollectorPorts, RuntimeCommand } from "./native-runtime-tools.ts";
export type RuntimeCollectionError =
  | "certificate-unavailable"
  | "config-invalid"
  | "config-unavailable"
  | "record-invalid"
  | "release-tag-invalid"
  | "release-tag-required"
  | NativeFingerprintError;
export type RuntimeCollectorInput = {
  readonly projectRoot: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
};
const CERTIFICATE = "./ota/publisher-certificate.pem";
const configSchema = z.object({
  version: z.string(),
  android: z.object({ package: z.string(), versionCode: z.number().int().positive() }),
  updates: z.object({ enabled: z.boolean() }),
});
const requestHeadersSchema = z.object({ "expo-channel-name": z.string() });
const codeSigningMetadataSchema = z.object({
  alg: z.literal("rsa-v1_5-sha256"),
  keyid: z.string(),
});
const enabledSchema = z.object({
  runtimeVersion: z.object({ policy: z.literal("fingerprint") }),
  updates: z.object({
    enabled: z.literal(true),
    url: z.string(),
    codeSigningCertificate: z.literal(CERTIFICATE),
    requestHeaders: requestHeadersSchema,
    codeSigningMetadata: codeSigningMetadataSchema,
  }),
});
type Config = { readonly value: z.output<typeof configSchema>; readonly raw: unknown };

type Prepared = {
  readonly commandRoot: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly releaseTag: string;
};
const prepare = (input: RuntimeCollectorInput): Result<Prepared, RuntimeCollectionError> => {
  const releaseTag = input.environment["PACE_RELEASE_TAG"];
  if (releaseTag === undefined || releaseTag === "") {
    return err("release-tag-required");
  }
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(releaseTag)) {
    return err("release-tag-invalid");
  }
  return ok({
    commandRoot: path.resolve(input.projectRoot),
    environment: { ...input.environment, EXPO_NO_DOTENV: "1", CI: "1" },
    releaseTag,
  });
};

const command = (prepared: Prepared, phase: "config" | "fingerprint"): RuntimeCommand => ({
  executable: path.join(
    prepared.commandRoot,
    "node_modules/.bin",
    phase === "config" ? "expo" : "expo-updates",
  ),
  args:
    phase === "config"
      ? ["config", "--type", "public", "--json"]
      : ["fingerprint:generate", "--platform", "android"],
  cwd: prepared.commandRoot,
  environment: prepared.environment,
});

const runJson = async (input: {
  readonly prepared: Prepared;
  readonly phase: "config" | "fingerprint";
  readonly ports: RuntimeCollectorPorts;
}): Promise<Result<unknown, RuntimeCollectionError>> => {
  const unavailable = input.phase === "config" ? "config-unavailable" : "fingerprint-unavailable";
  try {
    const output = await input.ports.run(command(input.prepared, input.phase));
    if (output.exitCode !== 0) {
      return err(unavailable);
    }
    try {
      return ok(JSON.parse(output.stdout) as unknown);
    } catch {
      return err(input.phase === "config" ? "config-invalid" : "fingerprint-unavailable");
    }
  } catch {
    return err(unavailable);
  }
};

const collectConfig = async (
  prepared: Prepared,
  ports: RuntimeCollectorPorts,
): Promise<Result<Config, RuntimeCollectionError>> => {
  const output = await runJson({ prepared, ports, phase: "config" });
  if (!output.ok) {
    return output;
  }
  const parsed = configSchema.safeParse(output.value);
  return parsed.success && `v${parsed.data.version}` === prepared.releaseTag
    ? ok({ value: parsed.data, raw: output.value })
    : err("config-invalid");
};

const collectTrust = async (input: {
  readonly config: Config;
  readonly prepared: Prepared;
  readonly ports: RuntimeCollectorPorts;
}): Promise<Result<NativeRuntimeRecord["ota"], RuntimeCollectionError>> => {
  if (!input.config.value.updates.enabled) {
    return ok({ isEnabled: false, trust: null });
  }
  const parsed = enabledSchema.safeParse(input.config.raw);
  if (!parsed.success) {
    return err("config-invalid");
  }
  try {
    const bytes = await input.ports.read(
      path.join(input.prepared.commandRoot, "ota/publisher-certificate.pem"),
    );
    const certificateSha256 = createHash("sha256")
      .update(new X509Certificate(bytes).raw)
      .digest("hex");
    const updates = parsed.data.updates;
    return ok({
      isEnabled: true,
      trust: {
        publisherUrl: updates.url,
        channel: updates.requestHeaders["expo-channel-name"],
        keyId: updates.codeSigningMetadata.keyid,
        certificateSha256,
      },
    });
  } catch {
    return err("certificate-unavailable");
  }
};

const collectFingerprint = async (
  prepared: Prepared,
  ports: RuntimeCollectorPorts,
  requiresCertificate: boolean,
): Promise<Result<string, RuntimeCollectionError>> => {
  const output = await runJson({ prepared, ports, phase: "fingerprint" });
  return output.ok ? validateNativeFingerprint(output.value, requiresCertificate) : output;
};

/** Real config and canonical SDK CLI evidence only; no caller-provided fingerprint field exists. */
export const collectNativeRuntime = async (
  input: RuntimeCollectorInput,
  ports: RuntimeCollectorPorts = runtimeCollectorPorts,
): Promise<Result<NativeRuntimeRecord, RuntimeCollectionError>> => {
  const prepared = prepare(input);
  if (!prepared.ok) {
    return prepared;
  }
  const config = await collectConfig(prepared.value, ports);
  if (!config.ok) {
    return config;
  }
  const ota = await collectTrust({ config: config.value, prepared: prepared.value, ports });
  if (!ota.ok) {
    return ota;
  }
  const fingerprint = await collectFingerprint(prepared.value, ports, ota.value.isEnabled);
  if (!fingerprint.ok) {
    return fingerprint;
  }
  return parseNativeRuntimeRecord({
    format: 1,
    platform: "android",
    packageId: config.value.value.android.package,
    nativeVersion: config.value.value.version,
    versionCode: config.value.value.android.versionCode,
    releaseTag: prepared.value.releaseTag,
    bunVersion: ports.bunVersion,
    fingerprint: fingerprint.value,
    ota: ota.value,
  });
};
