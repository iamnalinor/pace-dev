import { buildPath, type EndpointInput, type EndpointOutput, type EndpointShape } from "@pace/core";

/** An HTTP error from the API, with the machine-readable `code` when the server sent one. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiClient = {
  readonly call: <E extends EndpointShape>(
    endpoint: E,
    input: EndpointInput<E>,
  ) => Promise<EndpointOutput<E>>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const describeError = async (response: Response): Promise<ApiError> => {
  const body = await readBody(response);
  if (typeof body === "object" && body !== null && "message" in body && "code" in body) {
    const code = typeof body.code === "string" ? body.code : "unknown";
    const message = typeof body.message === "string" ? body.message : response.statusText;
    return new ApiError(response.status, code, message);
  }
  return new ApiError(response.status, "unknown", response.statusText);
};

const withQuery = (path: string, query: Readonly<Record<string, string>> | undefined): string => {
  if (query === undefined) {
    return path;
  }
  const search = new URLSearchParams(query).toString();
  return search === "" ? path : `${path}?${search}`;
};

/**
Typed HTTP client for the Pace API, driven by the shared endpoint contract. The bearer
token is read on every request so a login or logout takes effect immediately.
*/
export const createApiClient = (options: {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly token: () => string | undefined;
}): ApiClient => {
  const doFetch: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  return {
    call: async (endpoint, input) => {
      const { body, params, query } = input as {
        body?: unknown;
        params?: Record<string, string>;
        query?: Record<string, string>;
      };
      const credential = options.token();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (credential !== undefined) {
        headers["Authorization"] = `Bearer ${credential}`;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const url = `${options.baseUrl}${withQuery(buildPath(endpoint.path, params), query)}`;
      const response = await doFetch(url, {
        ...(body !== undefined && { body: JSON.stringify(body) }),
        headers,
        method: endpoint.method,
      });
      if (!response.ok) {
        throw await describeError(response);
      }
      return endpoint.output.parse(await response.json()) as EndpointOutput<typeof endpoint>;
    },
  };
};
