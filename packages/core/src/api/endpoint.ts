import type { z } from "zod";

export type HttpMethod = "DELETE" | "GET" | "POST" | "PUT";

/**
 * One HTTP endpoint, described once and shared by the Worker (which mounts it with
 * validation) and the clients (which call it, typed). Paths use Hono's `:param` syntax.
 */
export type EndpointShape = {
  readonly method: HttpMethod;
  readonly path: `/${string}`;
  /** Requires a bearer session. */
  readonly auth: boolean;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly output: z.ZodType;
};

export const endpoint = <const E extends EndpointShape>(definition: E): E => definition;

type InferInput<T> = T extends z.ZodType ? z.input<T> : never;

/** What a caller must supply: only the parts the endpoint declares. */
export type EndpointInput<E extends EndpointShape> = (E["body"] extends z.ZodType
  ? { readonly body: InferInput<E["body"]> }
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intersection identity
    {}) &
  (E["params"] extends z.ZodType ? { readonly params: InferInput<E["params"]> } : object) &
  (E["query"] extends z.ZodType ? { readonly query: InferInput<E["query"]> } : object);

export type EndpointOutput<E extends EndpointShape> = z.output<E["output"]>;

/** Error body every endpoint may return besides its declared output. */
export type ApiProblem = {
  readonly code: string;
  readonly message: string;
};

/** Builds the concrete URL path by substituting `:param` segments. */
export const buildPath = (
  path: string,
  params: Readonly<Record<string, string>> | undefined,
): string =>
  path.replaceAll(/:(\w+)/g, (_match, name: string) => {
    const value = params?.[name];
    return value === undefined ? `:${name}` : encodeURIComponent(value);
  });
