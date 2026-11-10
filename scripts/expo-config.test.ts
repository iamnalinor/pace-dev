import { expect, test } from "bun:test";
import path from "node:path";

const app = path.resolve(import.meta.dir, "../apps/app");

/** Exercise Expo's actual Node loader; Jest/Bun transpilation resolves different module paths. */
const loadExpoConfig = (mode: "baked" | "runtime") => {
  const result = Bun.spawnSync(
    ["node", path.join(app, "node_modules/expo/bin/cli"), "config", "--type", "public", "--json"],
    {
      cwd: app,
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_DOTENV: "1",
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Reproduce the emulator-loopback CI config; this loader-only test sends no requests.
        EXPO_PUBLIC_API_URL: "http://10.0.2.2:8787",
        EXPO_PUBLIC_DEV_LOGIN: "1",
        EXPO_PUBLIC_FIREBASE_MODE: mode,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};

test.each(["baked", "runtime"] as const)(
  "Expo's Node loader reads the %s Android config",
  (mode) => {
    const result = loadExpoConfig(mode);
    expect({
      code: result.code,
      diagnostic: result.code === 0 ? "" : result.stdout + result.stderr,
    }).toEqual({ code: 0, diagnostic: "" });
  },
  // The real Expo CLI cold-starts under Node and evaluates app.config.ts: seconds, and slower
  // on a loaded runner than Bun's default 5 s per test allows.
  60_000,
);
