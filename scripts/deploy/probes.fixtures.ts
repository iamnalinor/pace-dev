import { ok, PROTOCOL } from "@pace/core";

import type { ProbeTarget } from "./ports.ts";

import { createHttpProbes } from "./probes.ts";

const target = { accountId: "account", workerName: "worker" };
export const preview: ProbeTarget & { kind: "version" } = {
  ...target,
  kind: "version",
  versionId: "version",
  previewUrl: "https://version.example",
};
export const production: ProbeTarget = { ...target, kind: "production" };
export const ready = {
  identity: { status: "available", versionId: "version", attempt: "run" },
  policy: "strict",
  firebase: { verdict: "ready", mode: "disabled" },
};
const instance = {
  name: "Pace",
  version: "sha",
  protocol: PROTOCOL,
  minClientProtocol: PROTOCOL,
  botUsername: "bot",
  webOrigin: null,
  apiOrigin: "https://production.example",
  firebase: null,
  loginMethods: [],
};
export const json = (value: unknown, status = 200): Response => Response.json(value, { status });
type Fixture = {
  readonly calls: { url: string; init: RequestInit }[];
  readonly config: Parameters<typeof createHttpProbes>[0];
  readonly probes: ReturnType<typeof createHttpProbes>;
};
export const fixture = (
  respond?: (url: string, init: RequestInit) => Promise<Response>,
  timeoutMs = 100,
): Fixture => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (respond !== undefined) {
      return await respond(url, init);
    }
    if (url.endsWith("deployment-readiness")) {
      return json(ready);
    }
    return json(url.endsWith("health") ? { status: "ok" } : instance);
  };
  const config = {
    target,
    productionOrigin: "https://production.example",
    resolveVersionOrigin: async () => {
      await Promise.resolve();
      return ok("https://version.example");
    },
    accessHeaders: {
      "CF-Access-Client-Id": "SECRET_ID",
      "CF-Access-Client-Secret": "SECRET_VALUE",
    },
    fetch,
    timeoutMs,
  };
  return { calls, config, probes: createHttpProbes(config) };
};
