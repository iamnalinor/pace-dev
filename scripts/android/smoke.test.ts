import { describe, expect, it } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const script = path.join(import.meta.dir, "smoke.sh");
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- this fixture exercises the required emulator-local test origin
const emulatorOrigin = "http://10.0.2.2:8787";

describe("Android smoke runner", () => {
  it("refuses to build with a missing emulator API origin or dev login flag", () => {
    for (const env of [
      { EXPO_PUBLIC_API_URL: "", EXPO_PUBLIC_DEV_LOGIN: "1" },
      { EXPO_PUBLIC_API_URL: "https://pace-api.nalinor.dev", EXPO_PUBLIC_DEV_LOGIN: "1" },
      { EXPO_PUBLIC_API_URL: emulatorOrigin, EXPO_PUBLIC_DEV_LOGIN: "" },
    ]) {
      const result = Bun.spawnSync(["bash", script, "build"], {
        env: { ...process.env, ...env },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(
        "requires EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 and EXPO_PUBLIC_DEV_LOGIN=1",
      );
    }
  });

  it("waits for the Worker health payload and propagates Maestro failure with artifacts", () => {
    const result = runSmoke("test-failure");
    expect(result.exitCode).toBe(42);
    expect(result.trace).toBe("health\nhealth\ninstall\nmaestro\nlogcat\n");
    expect(result.files).toMatchObject({
      "logcat.txt": "Android diagnostics\n",
      "maestro.log": "Maestro failure\n",
    });
  });

  it("never installs the APK if the Worker fails to become healthy", () => {
    const result = runSmoke("not-ready");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Worker never became healthy");
    expect(result.trace).toContain("health\n");
    expect(result.trace).not.toContain("install");
    expect(result.trace).not.toContain("maestro");
  });

  it("refuses an APK whose bundled API origin is not local", () => {
    const result = runSmoke("wrong-origin");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("APK must embed the emulator API origin and dev login flag");
    expect(result.trace).toBe("");
  });

  it("refuses to touch a non-emulator device", () => {
    const result = runSmoke("physical-device");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("one booted x86_64 emulator");
    expect(result.trace).toBe("");
  });
});

const commands = {
  adb: `#!/bin/bash
if [[ "$1" == devices ]]; then
  printf 'List of devices attached\\nemulator-5554\\tdevice\\n'
else
  case "$3 \${4:-} \${5:-}" in
    'shell getprop ro.kernel.qemu')
      [[ "$CASE" != physical-device ]] && echo 1 || echo 0 ;;
    'shell getprop ro.product.cpu.abi') echo x86_64 ;;
    'shell getprop sys.boot_completed') echo 1 ;;
    'install '*) echo install >> "$TRACE" ;;
    'logcat -d '*) echo logcat >> "$TRACE"; echo 'Android diagnostics' ;;
    'exec-out screencap -p') echo 'Android screenshot' ;;
    *) exit 3 ;;
  esac
fi
`,
  apkanalyzer: `#!/bin/bash
case "$1 $2" in
  'manifest application-id') echo dev.nalinor.pace.e2e ;;
  'files cat')
    api_url="${emulatorOrigin}"
    if [[ "$CASE" == wrong-origin ]]; then api_url=https://pace-api.nalinor.dev; fi
    printf '{"extra":{"apiUrl":"%s","webOrigin":"${emulatorOrigin}","isDevLogin":true}}\n' "$api_url"
    ;;
  *) exit 3 ;;
esac
`,
  curl: `#!/bin/bash
[[ "\${*: -1}" == */api/health ]] || exit 7
echo health >> "$TRACE"
if [[ "$CASE" == not-ready || ! -f "$TRACE.first" ]]; then
  touch "$TRACE.first"
  echo '{"status":"down"}'
else
  echo '{"status":"ok"}'
fi
`,
  maestro: `#!/bin/bash
echo maestro >> "$TRACE"
echo 'Maestro failure'
exit 42
`,
  sleep: "#!/bin/bash\nexit 0\n",
  wrangler: `#!/bin/bash
if [[ "$1" == dev ]]; then
  exec /bin/sleep 60
fi
`,
};

const runSmoke = (scenario: string) => {
  const root = mkdtempSync(path.join(tmpdir(), "pace-android-test-"));
  const bin = path.join(root, "apps/api/node_modules/.bin");
  const apkDir = path.join(root, "apps/app/android/app/build/outputs/apk/release");
  const scripts = path.join(root, "scripts/android");
  const tracePath = path.join(root, "trace");
  try {
    for (const dir of [bin, apkDir, scripts]) {
      mkdirSync(dir, { recursive: true });
    }
    for (const [name, body] of Object.entries(commands)) {
      writeFileSync(path.join(bin, name), body, { mode: 0o755 });
    }
    writeFileSync(tracePath, "");
    writeFileSync(path.join(apkDir, "app-release.apk"), "");
    copyFileSync(script, path.join(scripts, "smoke.sh"));

    const run = Bun.spawnSync(["bash", path.join(scripts, "smoke.sh"), "run"], {
      env: {
        ...process.env,
        CASE: scenario,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        TRACE: tracePath,
      },
    });
    const files = Object.fromEntries(
      [...new Bun.Glob(".cache/android-e2e/run.*/*.*").scanSync({ cwd: root, absolute: true })].map(
        (file) => [path.basename(file), readFileSync(file, "utf8")],
      ),
    );
    return {
      exitCode: run.exitCode,
      files,
      output: run.stdout.toString() + run.stderr.toString(),
      trace: readFileSync(tracePath, "utf8"),
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};
