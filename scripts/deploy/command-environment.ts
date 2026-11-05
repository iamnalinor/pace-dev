import pathModule from "node:path";

import { err, ok, type Result } from "@pace/core";

type PrivatePaths = { readonly home: string; readonly temporary: string };
type DeploymentAuthentication = { readonly accountId: string; readonly apiToken: string };

const isNonblankAtom = (value: string): boolean => value.length > 0 && !/\s/u.test(value);

/**
Deliberately rebuild the child environment. In particular, never inherit runtime preload
flags, proxies, account credentials, Worker bindings or Wrangler debug settings.
The caller must create private directories and supply an explicit empty --env-file as
well as Bun's --no-env-file: Wrangler's global CLI dotenv loader is independent of dev vars.
*/
export const commandEnvironment = (
  ambient: Readonly<Record<string, string | undefined>>,
  paths: PrivatePaths,
  authentication: DeploymentAuthentication,
): Result<Readonly<Record<string, string>>, "invalid-command-environment"> => {
  const executablePath = ambient["PATH"];
  if (
    executablePath === undefined ||
    executablePath.trim() === "" ||
    !pathModule.isAbsolute(paths.home) ||
    !pathModule.isAbsolute(paths.temporary) ||
    !isNonblankAtom(authentication.accountId) ||
    !isNonblankAtom(authentication.apiToken)
  ) {
    return err("invalid-command-environment");
  }
  return ok({
    PATH: executablePath,
    HOME: paths.home,
    TMPDIR: paths.temporary,
    CLOUDFLARE_ACCOUNT_ID: authentication.accountId,
    CLOUDFLARE_API_TOKEN: authentication.apiToken,
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_SANITIZE: "true",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  });
};
