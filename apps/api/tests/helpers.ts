import { exports } from "cloudflare:workers";

export const api = exports.default;

export type RequestOptions = {
  readonly method?: "DELETE" | "GET" | "POST" | "PUT";
  readonly token?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
};

/** Calls the Worker the way a client would: JSON in, JSON out, optional bearer. */
export const call = async (path: string, options: RequestOptions = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token !== undefined) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  return await api.fetch(
    new Request(`https://pace-api.test${path}`, {
      body: options.body === undefined ? null : JSON.stringify(options.body),
      headers,
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    }),
  );
};

/** Parses a JSON body; the caller names the shape it expects (platform `Response.json()` is untyped). */
export const readJson = async <T>(response: Response): Promise<T> =>
  JSON.parse(await response.text()) as T;

export const json = async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> =>
  await readJson<T>(await call(path, options));

/** The store id a client confirms with a pull before it pushes. */
export const storeIdOf = async (token: string): Promise<string> =>
  (await json<{ storeId: string }>("/api/sync/pull?limit=1", { token })).storeId;

/** `POST /api/sync/push` as a client sends it: with the store id its last pull confirmed. */
export const pushEvents = async <T = unknown>(
  token: string,
  events: readonly unknown[],
): Promise<T> =>
  await json<T>("/api/sync/push", { body: { events, storeId: await storeIdOf(token) }, token });

/** Signs in through the dev endpoint (ENVIRONMENT is "test" in vitest.config.ts). */
export const loginAsDev = async (telegramId: string): Promise<string> => {
  const response = await call("/api/auth/dev", { body: { telegramId } });
  if (response.status !== 200) {
    throw new Error(`dev login failed: ${response.status} ${await response.text()}`);
  }
  const { token } = await readJson<{ token: string }>(response);
  return token;
};
