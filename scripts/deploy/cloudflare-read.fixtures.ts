import { createCloudflareReader } from "./cloudflare-read.ts";

export const target = { accountId: "a".repeat(32), workerName: "pace-worker" };
export const versionId = "12345678-1234-4234-8234-123456789abc";
export const otherVersionId = "87654321-1234-4234-8234-123456789abc";
export const deploymentId = "aaaaaaaa-1234-4234-8234-123456789abc";
export const success = (
  result: unknown,
): { readonly success: true; readonly errors: readonly unknown[]; readonly result: unknown } => ({
  success: true,
  errors: [],
  result,
});
export const worker = {
  id: "worker-id",
  name: target.workerName,
  subdomain: { previews_enabled: true, preview_url_suffix: "-pace-worker.owned.workers.dev" },
};
export const deployment = {
  id: deploymentId,
  strategy: "percentage",
  versions: [{ version_id: versionId, percentage: 100 }],
};
export const version = {
  id: versionId,
  metadata: { hasPreview: true },
  resources: { script_runtime: { exports: { default: { type: "worker" } } } },
};
const defaultResult = (url: string): unknown => {
  if (url.endsWith(`/accounts/${target.accountId}`)) {
    return { id: target.accountId };
  }
  if (url.endsWith("/deployments")) {
    return { deployments: [deployment] };
  }
  if (url.endsWith("/versions")) {
    return { items: [{ id: versionId, number: 2 }] };
  }
  if (url.endsWith(versionId)) {
    return version;
  }
  return worker;
};
type Fixture = {
  readonly calls: { readonly url: string; readonly init: RequestInit }[];
  readonly config: Parameters<typeof createCloudflareReader>[0];
  readonly reader: ReturnType<typeof createCloudflareReader>;
};
export const fixture = (
  respond?: (url: string) => Promise<Response> | Response,
  timeoutMs = 100,
): Fixture => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return respond === undefined
      ? Response.json(success(defaultResult(url)), { status: 200 })
      : await respond(url);
  };
  const config = { target, apiToken: "SECRET_API_TOKEN", fetch, timeoutMs };
  return { calls, config, reader: createCloudflareReader(config) };
};
