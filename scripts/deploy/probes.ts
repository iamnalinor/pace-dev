import type { z } from "zod";

import { endpoints, err, ok, PROTOCOL, PROTOCOL_HEADER, type Result } from "@pace/core";

import type {
  DeploymentPorts,
  PortError,
  PortResult,
  Probe,
  ProbeTarget,
  Target,
} from "./ports.ts";

import { readBaselineReadiness } from "./verification.ts";

type ProbeConfig = {
  readonly target: Target;
  readonly productionOrigin: string;
  /** Must resolve this exact version from authenticated control-plane data, never user input. */
  readonly resolveVersionOrigin: (target: Target, versionId: string) => PortResult<string>;
  readonly accessHeaders: Readonly<Record<string, string>>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly timeoutMs: number;
};
type HttpResult<T> = Result<T, PortError>;
type HttpContext = {
  readonly config: ProbeConfig;
  readonly origin: string;
  readonly signal: AbortSignal;
};
type HttpRequest = { readonly url: string; readonly headers: Readonly<Record<string, string>> };
const MAX_BODY_BYTES = 1_048_576;
// Read afresh after await: cancellation can change while network or body I/O is pending.
const hasAborted = (signal: AbortSignal): boolean => signal.aborted;

const isCanonicalOrigin = (input: string): boolean => {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && parsed.origin === input;
  } catch {
    return false;
  }
};

const previewResolverError = (error: PortError): PortError =>
  error === "unsupported-version-preview" || error === "unauthorized" ? error : "transport";

const resolvePreviewOrigin = async (
  config: ProbeConfig,
  target: ProbeTarget & { kind: "version" },
  signal: AbortSignal,
): Promise<HttpResult<string>> => {
  if (
    !isCanonicalOrigin(target.previewUrl) ||
    target.versionId.trim() === "" ||
    target.versionId !== target.versionId.trim()
  ) {
    return err("malformed");
  }
  const origin = await config.resolveVersionOrigin(config.target, target.versionId);
  if (hasAborted(signal)) {
    return err("transport");
  }
  if (!origin.ok) {
    return err(previewResolverError(origin.error));
  }
  if (!isCanonicalOrigin(origin.value) || origin.value !== target.previewUrl) {
    return err("malformed");
  }
  return origin;
};

const doesTargetMatch = (config: ProbeConfig, target: ProbeTarget): boolean =>
  [config.target.accountId, config.target.workerName].every(
    (value) => value !== "" && value === value.trim(),
  ) &&
  target.accountId === config.target.accountId &&
  target.workerName === config.target.workerName;

const originFor = async (
  config: ProbeConfig,
  target: ProbeTarget,
  signal: AbortSignal,
): Promise<HttpResult<string>> => {
  if (!doesTargetMatch(config, target) || !isCanonicalOrigin(config.productionOrigin)) {
    return err("malformed");
  }
  return target.kind === "production"
    ? ok(config.productionOrigin)
    : await resolvePreviewOrigin(config, target, signal);
};

const bounded = async <T>(
  config: ProbeConfig,
  operation: (signal: AbortSignal) => Promise<HttpResult<T>>,
): Promise<HttpResult<T>> => {
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs <= 0 ||
    config.timeoutMs > 120_000
  ) {
    return err("malformed");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<HttpResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(err("transport"));
    }, config.timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch {
    return err("transport");
  } finally {
    clearTimeout(timer);
  }
};

const cancelStream = async (
  stream: null | { readonly cancel: () => Promise<void> },
): Promise<void> => {
  try {
    await stream?.cancel();
  } catch {
    // Cleanup is best effort; cancellation failure must not replace the fixed probe verdict.
  }
};

const cancelBody = (response: Response): void => {
  void cancelStream(response.body);
};

const fetchResponse = async (
  config: ProbeConfig,
  { url, headers }: HttpRequest,
  signal: AbortSignal,
): Promise<HttpResult<Response>> => {
  if (hasAborted(signal)) {
    return err("transport");
  }
  const response = await config.fetch(url, { method: "GET", headers, redirect: "manual", signal });
  if (hasAborted(signal)) {
    cancelBody(response);
    return err("transport");
  }
  if (response.url !== "" && response.url !== url) {
    cancelBody(response);
    return err("malformed");
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    cancelBody(response);
    return err("malformed");
  }
  return ok(response);
};

const readText = async (
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "cancel" | "read">,
  signal: AbortSignal,
): Promise<HttpResult<string>> => {
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (!hasAborted(signal)) {
    const chunk = await reader.read();
    if (hasAborted(signal)) {
      return err("transport");
    }
    if (chunk.done) {
      return ok(text + decoder.decode());
    }
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      void cancelStream(reader);
      return err("malformed");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return err("transport");
};

const readJson = async (response: Response, signal: AbortSignal): Promise<HttpResult<unknown>> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return err("malformed");
  }
  const abort = () => {
    void cancelStream(reader);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const text = await readText(reader, signal);
    if (!text.ok) {
      return text;
    }
    try {
      return ok(JSON.parse(text.value) as unknown);
    } catch {
      return err("malformed");
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
};

const requestJson = async <T>(
  { config, origin, signal }: HttpContext,
  endpoint: { readonly path: string; readonly output: z.ZodType<T> },
): Promise<HttpResult<T>> => {
  const headers = {
    ...config.accessHeaders,
    Accept: "application/json",
    [PROTOCOL_HEADER]: String(PROTOCOL),
  };
  const response = await fetchResponse(config, { url: origin + endpoint.path, headers }, signal);
  if (!response.ok) {
    return response;
  }
  if (response.value.status !== 200) {
    cancelBody(response.value);
    return err(
      response.value.status === 401 || response.value.status === 403 ? "unauthorized" : "transport",
    );
  }
  const json = await readJson(response.value, signal);
  if (!json.ok) {
    return json;
  }
  if (
    endpoint.path === endpoints.deploymentReadiness.path &&
    !readBaselineReadiness(json.value).ok
  ) {
    return err("malformed");
  }
  const parsed = endpoint.output.safeParse(json.value);
  return parsed.success ? ok(parsed.data) : err("malformed");
};

const probeAt = async (context: HttpContext, target: ProbeTarget): Promise<HttpResult<Probe>> => {
  const readiness = await requestJson(context, endpoints.deploymentReadiness);
  if (!readiness.ok) {
    return readiness;
  }
  if (
    target.kind === "version" &&
    (readiness.value.identity.status !== "available" ||
      readiness.value.identity.versionId !== target.versionId)
  ) {
    return err("malformed");
  }
  const health = await requestJson(context, endpoints.health);
  if (!health.ok) {
    return health;
  }
  const instance = await requestJson(context, endpoints.instance);
  return instance.ok ? ok({ readiness: readiness.value, health: true, instance: true }) : instance;
};

/** No hostname formula: exact preview trust must come from authenticated control-plane wiring. */
export const createHttpProbes = (
  config: ProbeConfig,
): Pick<DeploymentPorts, "anonymousStatus" | "probe"> => ({
  probe: async (target) =>
    await bounded(config, async (signal) => {
      const origin = await originFor(config, target, signal);
      return origin.ok ? await probeAt({ config, origin: origin.value, signal }, target) : origin;
    }),
  anonymousStatus: async (target) =>
    await bounded(config, async (signal) => {
      const origin = await originFor(config, target, signal);
      if (!origin.ok) {
        return origin;
      }
      const response = await fetchResponse(
        config,
        {
          url: origin.value + endpoints.deploymentReadiness.path,
          headers: { [PROTOCOL_HEADER]: String(PROTOCOL) },
        },
        signal,
      );
      if (!response.ok) {
        return response;
      }
      cancelBody(response.value);
      return ok(response.value.status);
    }),
});
