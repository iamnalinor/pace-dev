import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const androidClient = {
  api_key: [{ current_key: "fixture-client-api-key" }],
  client_info: {
    android_client_info: { package_name: "dev.fixture.android" },
    mobilesdk_app_id: "1:123:android:fixture",
  },
};
const projectInfo = { project_id: "fixture-project", project_number: "123" };
const serviceAccount = {
  client_email: "fixture-sender@example.invalid",
  private_key: "fixture-private-key-fragment",
  project_id: "fixture-project",
};
const configured = {
  FIREBASE_ANDROID_CONFIG: JSON.stringify({ client: [androidClient], project_info: projectInfo }),
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify(serviceAccount),
};

const root = path.join(import.meta.dir, "..");

const runBunIn = (cwd: string, env: Record<string, string>, ...args: string[]) => {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd,
    env: {
      PATH: [path.dirname(process.execPath), process.env["PATH"] ?? ""].join(path.delimiter),
      ...env,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    code: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const runBun = (env: Record<string, string>, ...args: string[]) => runBunIn(root, env, ...args);

const run = (env: Record<string, string>, ...args: string[]) =>
  runBun(env, "--no-env-file", "--silent", "run", "check:config", ...args);

test("the default package command does not print environment values", () => {
  expect(runBun(configured, "run", "check:config")).toEqual({
    code: 0,
    stderr: "$ bun --no-env-file scripts/check-config.ts\n",
    stdout: "configured\n",
  });
});

test("the direct entry point rejects unknown arguments without printing them", () => {
  expect(
    runBun(configured, "--no-env-file", "scripts/check-config.ts", "--fixture-sensitive-argument"),
  ).toEqual({ code: 1, stderr: "invalid-arguments\n", stdout: "" });
});

test("accepts a complete pair without printing its values", () => {
  expect(run(configured)).toEqual({ code: 0, stderr: "", stdout: "configured\n" });
});

test("accepts an absent pair", () => {
  expect(run({})).toEqual({ code: 0, stderr: "", stdout: "disabled\n" });
});

test("ignores conflicting dotenv values in the documented CI invocation", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "pace-firebase-preflight-"));
  try {
    mkdirSync(path.join(fixture, "scripts"));
    copyFileSync(path.join(root, "package.json"), path.join(fixture, "package.json"));
    copyFileSync(
      path.join(root, "scripts", "check-config.ts"),
      path.join(fixture, "scripts", "check-config.ts"),
    );
    symlinkSync(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "junction");
    writeFileSync(
      path.join(fixture, ".env"),
      "FIREBASE_ANDROID_CONFIG=dotenv-fixture-android\nFIREBASE_SERVICE_ACCOUNT=dotenv-fixture-account\n",
    );

    expect(
      runBunIn(
        fixture,
        {},
        "--no-env-file",
        "--silent",
        "run",
        "check:config",
        "--expect=disabled",
      ),
    ).toEqual({ code: 0, stderr: "", stdout: "disabled\n" });
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});

test("accepts the configured expectation for a complete pair", () => {
  expect(run(configured, "--expect=configured")).toEqual({
    code: 0,
    stderr: "",
    stdout: "configured\n",
  });
});

test("accepts the disabled expectation for an absent pair", () => {
  expect(run({}, "--expect=disabled")).toEqual({ code: 0, stderr: "", stdout: "disabled\n" });
});

test.each([
  ["missing-android-config", { ...configured, FIREBASE_ANDROID_CONFIG: "" }],
  ["missing-service-account", { ...configured, FIREBASE_SERVICE_ACCOUNT: "" }],
  [
    "android-config-not-json",
    { ...configured, FIREBASE_ANDROID_CONFIG: "fixture-malformed-secret" },
  ],
  [
    "android-config-invalid",
    { ...configured, FIREBASE_ANDROID_CONFIG: JSON.stringify("fixture-secret") },
  ],
  [
    "no-android-clients",
    {
      ...configured,
      FIREBASE_ANDROID_CONFIG: JSON.stringify({ client: [], project_info: projectInfo }),
    },
  ],
  [
    "duplicate-android-package",
    {
      ...configured,
      FIREBASE_ANDROID_CONFIG: JSON.stringify({
        client: [androidClient, androidClient],
        project_info: projectInfo,
      }),
    },
  ],
  ["invalid-service-account", { ...configured, FIREBASE_SERVICE_ACCOUNT: "fixture-malformed-key" }],
  [
    "invalid-service-account",
    {
      ...configured,
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...serviceAccount, private_key: " " }),
    },
  ],
  [
    "project-mismatch",
    {
      ...configured,
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        ...serviceAccount,
        project_id: "fixture-other-project",
      }),
    },
  ],
] as const)("rejects %s without printing any inputs", (reason, env) => {
  expect(run(env)).toEqual({ code: 1, stderr: `${reason}\n`, stdout: "" });
});

test("rejects an absent pair when configuration is expected", () => {
  expect(run({}, "--expect=configured")).toEqual({
    code: 1,
    stderr: "expected-configured\n",
    stdout: "",
  });
});

test("rejects a configured pair when disable is expected", () => {
  expect(run(configured, "--expect=disabled")).toEqual({
    code: 1,
    stderr: "expected-disabled\n",
    stdout: "",
  });
});

test.each([
  ["an unknown flag", ["--fixture-sensitive-argument"]],
  ["an unknown expectation", ["--expect=fixture-sensitive-argument"]],
  ["multiple expectations", ["--expect=configured", "--expect=disabled"]],
] as const)("rejects %s without printing arguments", (_description, args) => {
  expect(run(configured, ...args)).toEqual({ code: 1, stderr: "invalid-arguments\n", stdout: "" });
});
