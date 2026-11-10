import { expect, it } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const runBuild = (status: number): { status: number; args: string[] } => {
  const root = mkdtempSync(path.join(tmpdir(), "pace-android-build-"));
  const scripts = path.join(root, "scripts/android");
  const android = path.join(root, "apps/app/android");
  const bin = path.join(root, "bin");
  try {
    for (const directory of [scripts, android, bin]) {
      mkdirSync(directory, { recursive: true });
    }
    copyFileSync(path.join(import.meta.dir, "smoke.sh"), path.join(scripts, "smoke.sh"));
    writeFileSync(path.join(bin, "bun"), "#!/bin/bash\nprintf 'prebuild\\n' >> \"$TRACE\"\n", {
      mode: 0o755,
    });
    writeFileSync(
      path.join(android, "gradlew"),
      '#!/bin/bash\nprintf \'%s\\n\' "$@" >> "$TRACE"\nexit "$BUILD_STATUS"\n',
      { mode: 0o755 },
    );
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- fixed emulator-local origin required by the isolated build fixture
    const emulatorOrigin = "http://10.0.2.2:8787";
    const run = Bun.spawnSync(["bash", path.join(scripts, "smoke.sh"), "build"], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"]}`,
        TRACE: path.join(root, "trace"),
        BUILD_STATUS: String(status),
        EXPO_PUBLIC_API_URL: emulatorOrigin,
        EXPO_PUBLIC_DEV_LOGIN: "1",
      },
    });
    return {
      status: run.exitCode,
      args: readFileSync(path.join(root, "trace"), "utf8").split("\n"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

it("gives the clean smoke build sufficient metaspace and exits immediately on JVM exhaustion", () => {
  const result = runBuild(47);
  expect(result.args).toContain("prebuild");
  expect(result.args).toContain("--no-daemon");
  expect(result.args).toContain(
    "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -XX:+ExitOnOutOfMemoryError",
  );
  expect(result.args).toContain("-PreactNativeArchitectures=x86_64");
  expect(result.args).toContain("-PPACE_STORE_FILE=");
  expect(result.status).toBe(47);
});

it("applies the same fail-fast memory budget to both arm64 build workflows", () => {
  for (const workflow of ["ci.yml", "release.yml"]) {
    const source = readFileSync(
      path.join(import.meta.dir, "../../.github/workflows", workflow),
      "utf8",
    );
    expect(source).toContain(
      "'-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -XX:+ExitOnOutOfMemoryError'",
    );
    expect(source).toContain("-PreactNativeArchitectures=arm64-v8a");
  }
});
