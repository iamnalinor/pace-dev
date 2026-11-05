import type { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { DeploymentPorts, PortError, PortResult, Target } from "./ports.ts";
import type { AuthenticatedSnapshot } from "./types.ts";

import {
  type ApiContext,
  type ApiResponse,
  type CloudflareHttp,
  readCloudflare,
  withCloudflareDeadline,
} from "./cloudflare-http.ts";
import {
  accountSchema,
  deploymentsSchema,
  missingWorkerSchema,
  successSchema,
  versionSchema,
  versionsSchema,
  workerSchema,
} from "./cloudflare-schemas.ts";

type ReaderConfig = CloudflareHttp & { readonly target: Target };
type Worker = z.output<typeof workerSchema>;
const isRequestTarget = (config: ReaderConfig, target: Target): boolean =>
  /^[a-f0-9]{32}$/.test(config.target.accountId) &&
  /^[a-z0-9][a-z0-9_-]{0,62}$/.test(config.target.workerName) &&
  config.apiToken !== "" &&
  !/\s/u.test(config.apiToken) &&
  target.accountId === config.target.accountId &&
  target.workerName === config.target.workerName;
const accountPath = (target: Target): string => `/accounts/${target.accountId}`;
const scriptPath = (target: Target): string =>
  `${accountPath(target)}/workers/scripts/${encodeURIComponent(target.workerName)}`;
const parseResult = <T>(response: ApiResponse, schema: z.ZodType<T>): Result<T, PortError> => {
  if (response.status !== 200) {
    return err("malformed");
  }
  const envelope = successSchema.safeParse(response.body);
  if (!envelope.success) {
    return err("malformed");
  }
  const parsed = schema.safeParse(envelope.data.result);
  return parsed.success ? ok(parsed.data) : err("malformed");
};
const authorizedWorker = async (
  context: ApiContext,
  target: Target,
): Promise<Result<null | Worker, PortError>> => {
  const account = await readCloudflare(context, accountPath(target));
  if (!account.ok) {
    return account;
  }
  const verified = parseResult(account.value, accountSchema);
  if (!verified.ok || verified.value.id !== target.accountId) {
    return err("unauthorized");
  }
  const response = await readCloudflare(
    context,
    `${accountPath(target)}/workers/workers/${encodeURIComponent(target.workerName)}`,
  );
  if (!response.ok) {
    return response;
  }
  if (response.value.status === 404 && missingWorkerSchema.safeParse(response.value.body).success) {
    return ok(null);
  }
  const worker = parseResult(response.value, workerSchema);
  if (!worker.ok) {
    return worker;
  }
  return worker.value.name === target.workerName ? worker : err("malformed");
};
const snapshotOf = (
  target: Target,
  deployments: z.output<typeof deploymentsSchema>,
  versions: z.output<typeof versionsSchema>,
): Result<AuthenticatedSnapshot, PortError> => {
  const [active] = deployments.deployments;
  const [latest] = versions.items;
  if (active === undefined || latest === undefined) {
    return err("malformed");
  }
  return ok({
    status: "existing",
    ...target,
    deploymentId: active.id,
    latestVersionId: latest.id,
    active: active.versions.map(({ version_id, percentage }) => ({
      versionId: version_id,
      percentage,
    })),
  });
};
const existingSnapshot = async (
  context: ApiContext,
  target: Target,
): Promise<Result<AuthenticatedSnapshot, PortError>> => {
  const deploymentResponse = await readCloudflare(context, `${scriptPath(target)}/deployments`);
  if (!deploymentResponse.ok) {
    return deploymentResponse;
  }
  const deployments = parseResult(deploymentResponse.value, deploymentsSchema);
  if (!deployments.ok) {
    return deployments;
  }
  const latestResponse = await readCloudflare(context, `${scriptPath(target)}/versions`);
  if (!latestResponse.ok) {
    return latestResponse;
  }
  const versions = parseResult(latestResponse.value, versionsSchema);
  return versions.ok ? snapshotOf(target, deployments.value, versions.value) : versions;
};

const snapshot = async (
  context: ApiContext,
  target: Target,
): Promise<Result<AuthenticatedSnapshot, PortError>> => {
  const worker = await authorizedWorker(context, target);
  if (!worker.ok) {
    return worker;
  }
  return worker.value === null
    ? ok({ status: "absent", ...target })
    : await existingSnapshot(context, target);
};

const previewSuffix = (
  worker: Worker,
  version: z.output<typeof versionSchema>,
): Result<string, PortError> => {
  const runtimeExports = Object.values(version.resources.script_runtime?.exports ?? {});
  if (
    version.metadata.hasPreview !== true ||
    runtimeExports.some((entry) => entry.type === "durable-object")
  ) {
    return err("unsupported-version-preview");
  }
  const subdomain = worker.subdomain;
  return subdomain?.previews_enabled !== true || subdomain.preview_url_suffix === undefined
    ? err("unsupported-version-preview")
    : ok(subdomain.preview_url_suffix);
};
const previewOrigin = (
  worker: Worker,
  version: z.output<typeof versionSchema>,
  expectedId: string,
): Result<string, PortError> => {
  if (version.id !== expectedId) {
    return err("malformed");
  }
  const suffix = previewSuffix(worker, version);
  if (!suffix.ok) {
    return suffix;
  }
  const origin = `https://${version.id.slice(0, 8)}${suffix.value}`;
  const url = new URL(origin);
  return url.origin === origin &&
    url.hostname.endsWith(".workers.dev") &&
    suffix.value.startsWith(`-${worker.name}.`)
    ? ok(origin)
    : err("malformed");
};
const resolveVersion = async (
  context: ApiContext,
  target: Target,
  versionId: string,
): PortResult<string> => {
  const worker = await authorizedWorker(context, target);
  if (!worker.ok) {
    return worker;
  }
  if (worker.value === null) {
    return err("unsupported-version-preview");
  }
  const response = await readCloudflare(context, `${scriptPath(target)}/versions/${versionId}`);
  if (!response.ok) {
    return response;
  }
  const version = parseResult(response.value, versionSchema);
  return version.ok ? previewOrigin(worker.value, version.value, versionId) : version;
};

/**
Requires Account Read in addition to Worker metadata/version reads; authorization failure has
no weaker fallback. First-item ordering follows Wrangler 4.156.0's deployments/latest reads.
Version URLs do not support DO implementations. No zero-percent-deployment fallback exists.
*/
export const createCloudflareReader = (
  config: ReaderConfig,
): Pick<DeploymentPorts, "readSnapshot"> & {
  readonly resolveVersionOrigin: (target: Target, versionId: string) => PortResult<string>;
} => ({
  readSnapshot: async (target) =>
    isRequestTarget(config, target)
      ? await withCloudflareDeadline(config, async (context) => await snapshot(context, target))
      : await Promise.resolve(err("malformed")),
  resolveVersionOrigin: async (target, versionId) =>
    isRequestTarget(config, target) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(versionId)
      ? await withCloudflareDeadline(
          config,
          async (context) => await resolveVersion(context, target, versionId),
        )
      : await Promise.resolve(err("malformed")),
});
