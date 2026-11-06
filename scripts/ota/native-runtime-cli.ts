import { writeFile } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@pace/core";

import {
  collectNativeRuntime,
  type RuntimeCollectionError,
  type RuntimeCollectorInput,
} from "./native-runtime-collector.ts";
import {
  type CandidateRuntimeEvidence,
  type NativeRuntimeError,
  type NativeRuntimeRecord,
  parseNativeRuntimeRecord,
  verifyNativeRuntime,
} from "./native-runtime.ts";

export type RuntimeCliPorts = {
  readonly collect: (
    input: RuntimeCollectorInput,
  ) => Promise<Result<NativeRuntimeRecord, RuntimeCollectionError>>;
  readonly read: (file: string) => Promise<string>;
  readonly writeExclusive: (file: string, content: string) => Promise<void>;
};
export type RuntimeCliError =
  | "arguments-invalid"
  | "output-failed"
  | "record-unavailable"
  | "runtime-command-failed"
  | NativeRuntimeError
  | RuntimeCollectionError;
type CliCommand = (
  | { readonly mode: "record"; readonly output: string | undefined }
  | { readonly mode: "verify"; readonly record: string }
) & { readonly projectRoot: string };
const flags = new Set(["--project", "--output", "--record"]);

const readOptions = (
  args: readonly string[],
): Result<ReadonlyMap<string, string>, "arguments-invalid"> => {
  const options = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      value === "" ||
      !flags.has(flag) ||
      value.startsWith("--") ||
      options.has(flag)
    ) {
      return err("arguments-invalid");
    }
    options.set(flag, value);
  }
  return ok(options);
};

const parseCommand = (
  args: readonly string[],
  projectRoot: string,
): Result<CliCommand, "arguments-invalid"> => {
  const mode = args[0];
  if (mode !== "record" && mode !== "verify") {
    return err("arguments-invalid");
  }
  const parsed = readOptions(args);
  if (!parsed.ok) {
    return parsed;
  }
  const options = parsed.value;
  const root = options.get("--project") ?? projectRoot;
  if (mode === "verify") {
    const record = options.get("--record");
    return record === undefined || options.has("--output")
      ? err("arguments-invalid")
      : ok({ mode, projectRoot: root, record });
  }
  const output = options.get("--output");
  return options.has("--record")
    ? err("arguments-invalid")
    : ok({ mode, projectRoot: root, output });
};

const readRecord = async (
  file: string,
  ports: RuntimeCliPorts,
): Promise<Result<NativeRuntimeRecord, RuntimeCliError>> => {
  let text: string;
  try {
    text = await ports.read(file);
  } catch {
    return err("record-unavailable");
  }
  try {
    return parseNativeRuntimeRecord(JSON.parse(text) as unknown);
  } catch {
    return err("record-invalid");
  }
};

const evidenceOf = (record: NativeRuntimeRecord): CandidateRuntimeEvidence => ({
  platform: record.platform,
  packageId: record.packageId,
  releaseTag: record.releaseTag,
  nativeVersion: record.nativeVersion,
  versionCode: record.versionCode,
  fingerprint: record.fingerprint,
  bunVersion: record.bunVersion,
  ota: record.ota,
});

const verifyRecord = async (input: {
  readonly command: Extract<CliCommand, { readonly mode: "verify" }>;
  readonly collector: RuntimeCollectorInput;
  readonly ports: RuntimeCliPorts;
}): Promise<Result<string, RuntimeCliError>> => {
  const recorded = await readRecord(input.command.record, input.ports);
  if (!recorded.ok) {
    return recorded;
  }
  if (!recorded.value.ota.isEnabled) {
    return err("ota-disabled");
  }
  const current = await input.ports.collect(input.collector);
  if (!current.ok) {
    return current;
  }
  const verified = verifyNativeRuntime(recorded.value, evidenceOf(current.value));
  return verified.ok ? ok("compatible\n") : verified;
};

const writeRecord = async (input: {
  readonly command: Extract<CliCommand, { readonly mode: "record" }>;
  readonly collector: RuntimeCollectorInput;
  readonly ports: RuntimeCliPorts;
}): Promise<Result<string, RuntimeCliError>> => {
  const collected = await input.ports.collect(input.collector);
  if (!collected.ok) {
    return collected;
  }
  const content = `${JSON.stringify(collected.value)}\n`;
  if (input.command.output === undefined) {
    return ok(content);
  }
  try {
    await input.ports.writeExclusive(input.command.output, content);
    return ok("record-written\n");
  } catch {
    return err("output-failed");
  }
};

const defaultPorts: RuntimeCliPorts = {
  collect: collectNativeRuntime,
  read: async (file) => await Bun.file(file).text(),
  writeExclusive: async (file, content) => {
    await writeFile(file, content, { flag: "wx", mode: 0o644 });
  },
};

/** Records source/build metadata. Compiled APK provenance is deliberately outside this command. */
export const runNativeRuntimeCli = async (
  args: readonly string[],
  input: RuntimeCollectorInput,
  ports: RuntimeCliPorts = defaultPorts,
): Promise<Result<string, RuntimeCliError>> => {
  const parsed = parseCommand(args, input.projectRoot);
  if (!parsed.ok) {
    return parsed;
  }
  const collector = { ...input, projectRoot: parsed.value.projectRoot };
  try {
    return parsed.value.mode === "record"
      ? await writeRecord({ command: parsed.value, collector, ports })
      : await verifyRecord({ command: parsed.value, collector, ports });
  } catch {
    return err("runtime-command-failed");
  }
};

if (import.meta.main) {
  const result = await runNativeRuntimeCli(Bun.argv.slice(2), {
    projectRoot: path.resolve(import.meta.dir, "../../apps/app"),
    environment: { ...process.env },
  });
  if (result.ok) {
    process.stdout.write(result.value);
  } else {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
  }
}
