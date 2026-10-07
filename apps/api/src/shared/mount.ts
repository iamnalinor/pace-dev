import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

import type { EndpointOutput, EndpointShape, Result } from "@pace/core";

import type { AppEnv } from "./app-env.ts";

import { requireAuth } from "../auth/auth-middleware.ts";

/** A failure the handler chose: becomes `{ code, message }` with this status. */
export type Problem = {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly message: string;
};

type Parsed<T> = T extends z.ZodType ? z.output<T> : never;

/** What the handler receives: the validated (parsed) parts the endpoint declares, plus the context. */
export type HandlerInput<E extends EndpointShape> = (E["body"] extends z.ZodType
  ? { readonly body: Parsed<E["body"]> }
  : object) &
  (E["params"] extends z.ZodType ? { readonly params: Parsed<E["params"]> } : object) &
  (E["query"] extends z.ZodType ? { readonly query: Parsed<E["query"]> } : object) & {
    readonly c: Context<AppEnv>;
  };

export type Handler<E extends EndpointShape> = (
  input: HandlerInput<E>,
) => Promise<Result<EndpointOutput<E>, Problem>> | Result<EndpointOutput<E>, Problem>;

const readJson = async (c: Context<AppEnv>): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

/**
Mounts a contract endpoint on the app: guards it when the contract says `auth: true`,
validates params/query/body against the shared zod schemas (422 on mismatch), runs
the handler, serialises its Result.
*/
export const mount = <E extends EndpointShape>(
  app: Hono<AppEnv>,
  endpoint: E,
  handler: Handler<E>,
): void => {
  if (endpoint.auth) {
    app.on(endpoint.method, endpoint.path, requireAuth);
  }
  app.on(endpoint.method, endpoint.path, async (c) => {
    const rawBody = endpoint.body === undefined ? undefined : await readJson(c);
    const checks = [
      ["params", endpoint.params, c.req.param()],
      ["query", endpoint.query, c.req.query()],
      ["body", endpoint.body, rawBody],
    ] as const;
    const input: Record<string, unknown> = { c };
    for (const [name, schema, value] of checks) {
      if (schema === undefined) {
        continue;
      }
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue === undefined ? name : `${name}.${issue.path.join(".")}`;
        return c.json(
          { code: "validation", message: `${where}: ${issue?.message ?? "invalid"}` },
          422,
        );
      }
      input[name] = parsed.data;
    }
    const result = await handler(input as HandlerInput<E>);
    return result.ok
      ? c.json(result.value)
      : c.json({ code: result.error.code, message: result.error.message }, result.error.status);
  });
};
