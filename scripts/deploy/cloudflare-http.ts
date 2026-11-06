import { err, ok, type Result } from "@pace/core";

import type { PortError } from "./ports.ts";

export type CloudflareHttp = {
  readonly apiToken: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly timeoutMs: number;
};
export type ApiResponse = { readonly status: number; readonly body: unknown };
export type ApiContext = { readonly config: CloudflareHttp; readonly signal: AbortSignal };
const cancel = async (reader: null | { readonly cancel: () => Promise<void> }): Promise<void> => {
  try {
    await reader?.cancel();
  } catch {
    /* Best-effort resource cleanup must not replace the sanitized verdict. */
  }
};
// Read through a function after awaits: the signal may have changed during the request.
const isAborted = (signal: AbortSignal): boolean => signal.aborted;
const decode = (text: string): Result<unknown, PortError> => {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err("malformed");
  }
};
const consume = async (
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "cancel" | "read">,
  signal: AbortSignal,
): Promise<Result<unknown, PortError>> => {
  const chunks = { text: "", bytes: 0 };
  const decoder = new TextDecoder();
  for (;;) {
    const read = await reader.read();
    if (isAborted(signal)) {
      return err("transport");
    }
    if (read.done) {
      return decode(chunks.text + decoder.decode());
    }
    chunks.bytes += read.value.byteLength;
    if (chunks.bytes > 1_048_576) {
      void cancel(reader);
      return err("malformed");
    }
    chunks.text += decoder.decode(read.value, { stream: true });
  }
};
const bodyOf = async (
  response: Response,
  signal: AbortSignal,
): Promise<Result<unknown, PortError>> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return err("malformed");
  }
  const abort = () => {
    void cancel(reader);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await consume(reader, signal);
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
};
const isUsableResponse = (response: Response, url: string): boolean =>
  !response.redirected &&
  (response.url === "" || response.url === url) &&
  (response.status === 200 || response.status === 404);

export const readCloudflare = async (
  { config, signal }: ApiContext,
  path: string,
): Promise<Result<ApiResponse, PortError>> => {
  if (isAborted(signal)) {
    return err("transport");
  }
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const response = await config.fetch(url, {
    method: "GET",
    redirect: "manual",
    signal,
    headers: { Authorization: `Bearer ${config.apiToken}`, Accept: "application/json" },
  });
  if (isAborted(signal)) {
    void cancel(response.body);
    return err("transport");
  }
  if (response.status === 401 || response.status === 403) {
    void cancel(response.body);
    return err("unauthorized");
  }
  if (!isUsableResponse(response, url)) {
    void cancel(response.body);
    return err("malformed");
  }
  const body = await bodyOf(response, signal);
  return body.ok ? ok({ status: response.status, body: body.value }) : body;
};

export const withCloudflareDeadline = async <T>(
  config: CloudflareHttp,
  work: (context: ApiContext) => Promise<Result<T, PortError>>,
): Promise<Result<T, PortError>> => {
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 120_000
  ) {
    return err("malformed");
  }
  const abort = new AbortController();
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const failed = new Promise<Result<T, PortError>>((resolve) => {
    finishTimer = setTimeout(() => {
      abort.abort();
      resolve(err("transport"));
    }, config.timeoutMs);
  });
  try {
    return await Promise.race([failed, work({ config, signal: abort.signal })]);
  } catch {
    return err("transport");
  } finally {
    clearTimeout(finishTimer);
  }
};
