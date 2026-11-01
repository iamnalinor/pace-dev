import type { z } from "zod";

import { env, exports } from "cloudflare:workers";

import { bindNonce } from "../src/auth/nonce.ts";
import { findUserIdByTelegramId } from "../src/auth/users.ts";
import { d1 } from "../src/shared/db/d1.ts";

export const api = exports.default;

export type RequestOptions = {
  readonly method?: "DELETE" | "GET" | "POST" | "PUT";
  readonly token?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** What Cloudflare tells about the request (`request.cf`: country, city…); absent by default. */
  readonly cf?: Readonly<Record<string, unknown>>;
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
      ...(options.cf !== undefined && { cf: options.cf }),
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

/**
An endpoint's answer as `@pace/client` reads it: through the endpoint's own output schema (loose,
tolerant), so a test sees what a client sees and fails when the server answers off-contract.
*/
export const answerOf = async <T extends z.ZodType>(
  definition: { readonly output: T },
  path: string,
  options: RequestOptions = {},
): Promise<z.output<T>> => definition.output.parse(await json(path, options));

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

/**
A deep-link login of an existing account, as the app (`from=app`, named by the phone: an `app`
session) or the web (`from=web`: a `browser` session) starts it: the bot binds the nonce, the
client polls it.
*/
export const nonceLogin = async (
  telegramId: string,
  {
    deviceId,
    from,
    request = {},
  }: {
    readonly from: "app" | "web";
    readonly deviceId?: string;
    readonly request?: Pick<RequestOptions, "cf" | "headers">;
  },
): Promise<string> => {
  const { nonce } = await json<{ nonce: string }>(`/api/auth/nonce?from=${from}`, {
    body: deviceId === undefined ? {} : { deviceId, deviceName: "Pixel 9a" },
    ...request,
  });
  const userId = (await findUserIdByTelegramId(d1(env.DB), telegramId)) ?? "";
  await bindNonce(d1(env.DB), { nonce, now: Date.now(), userId });
  return (await json<{ token: string }>(`/api/auth/nonce/${nonce}`)).token;
};

/** What a store's SQL cost: whole-log loads, rows read and written, projection rows written. */
export type SqlCost = {
  readonly loads: number;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly projectionRows: number;
};

/**
Meters every statement a Durable Object runs from now on (drizzle calls `storage.sql.exec`), for
cost tests: `cost()` sums the cursors' `rowsRead` / `rowsWritten` once their statements ran.
*/
export const meterSql = (storage: DurableObjectStorage): { readonly cost: () => SqlCost } => {
  const { sql } = storage;
  const exec = sql.exec.bind(sql);
  const ran: { query: string; cursor: ReturnType<SqlStorage["exec"]> }[] = [];
  Object.defineProperty(sql, "exec", {
    configurable: true,
    value: (query: string, ...bindings: unknown[]) => {
      const cursor = exec(query, ...bindings);
      ran.push({ cursor, query });
      return cursor;
    },
  });
  const written = (pattern: RegExp) =>
    ran
      .filter(({ query }) => pattern.test(query))
      .reduce((sum, { cursor }) => sum + cursor.rowsWritten, 0);
  return {
    cost: () => ({
      loads: ran.filter(({ query }) => /^select .* from "events" order by/u.test(query)).length,
      projectionRows: written(
        /^(?:insert into|delete from) "(?:tasks|subtasks|projects|presets)"/u,
      ),
      rowsRead: ran.reduce((sum, { cursor }) => sum + cursor.rowsRead, 0),
      rowsWritten: written(/./u),
    }),
  };
};
