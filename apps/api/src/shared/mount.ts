import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { EndpointInput, EndpointOutput, EndpointShape, Result } from "@pace/core";

import type { AppEnv } from "./app-env.ts";

/** A failure the handler chose: becomes `{ code, message }` with this status. */
export type Problem = {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly message: string;
};

export type Handler<E extends EndpointShape> = (
  input: EndpointInput<E> & { readonly c: Context<AppEnv> },
) => Promise<Result<EndpointOutput<E>, Problem>> | Result<EndpointOutput<E>, Problem>;

const readJson = async (c: Context<AppEnv>): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

/**
 * Mounts a contract endpoint on the app: validates params/query/body against the shared
 * zod schemas (422 on mismatch), runs the handler, serialises its Result.
 */
export const mount = <E extends EndpointShape>(
  app: Hono<AppEnv>,
  endpoint: E,
  handler: Handler<E>,
): void => {
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
    const result = await handler(input as EndpointInput<E> & { readonly c: Context<AppEnv> });
    return result.ok
      ? c.json(result.value)
      : c.json({ code: result.error.code, message: result.error.message }, result.error.status);
  });
};
