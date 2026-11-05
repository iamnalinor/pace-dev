import { expect, it } from "bun:test";

import { commandEnvironment } from "./command-environment.ts";

const paths = { home: "/private/home", temporary: "/private/tmp" };
const auth = { accountId: "account", apiToken: "explicit-token" };

it("only forwards executable lookup and explicit deployment credentials", () => {
  const result = commandEnvironment(
    {
      PATH: "/verified/bin",
      HOME: "/user/home",
      NODE_OPTIONS: "--require malicious.js",
      BUN_OPTIONS: "--preload malicious.ts",
      CLOUDFLARE_API_TOKEN: "ambient-token",
      CLOUDFLARE_ACCOUNT_ID: "other-account",
      FIREBASE_SERVICE_ACCOUNT: "ambient-secret",
      HTTPS_PROXY: "https://foreign.example",
      WRANGLER_LOG_SANITIZE: "false",
    },
    paths,
    auth,
  );
  expect(result).toEqual({
    ok: true,
    value: {
      PATH: "/verified/bin",
      HOME: paths.home,
      TMPDIR: paths.temporary,
      CLOUDFLARE_API_TOKEN: auth.apiToken,
      CLOUDFLARE_ACCOUNT_ID: auth.accountId,
      CI: "1",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_SANITIZE: "true",
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    },
  });
});

it.each(["", " ", "token\nextra"])(
  "rejects invalid credentials without echoing them: %s",
  (apiToken) => {
    expect(commandEnvironment({ PATH: "/bin" }, paths, { ...auth, apiToken })).toEqual({
      ok: false,
      error: "invalid-command-environment",
    });
  },
);

it("refuses missing executable path and relative private directories", () => {
  expect(commandEnvironment({}, paths, auth).ok).toBe(false);
  expect(commandEnvironment({ PATH: "/bin" }, { ...paths, home: "relative" }, auth).ok).toBe(false);
  expect(commandEnvironment({ PATH: "/bin" }, { ...paths, temporary: "relative" }, auth).ok).toBe(
    false,
  );
});
