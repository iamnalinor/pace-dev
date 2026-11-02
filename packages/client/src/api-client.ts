import {
  buildPath,
  type EndpointInput,
  type EndpointOutput,
  type EndpointShape,
  PROTOCOL,
  PROTOCOL_HEADER,
} from "@pace/core";

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

/**
The request never got an answer: no network, the server unreachable, a connection cut. Kept
apart from `ApiError` (an answer the server gave), so only this reads as offline. Its message is
the platform's own ("Failed to fetch", "Network request failed").
*/
export class ApiUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnreachable";
  }
}

/** What a caller may add to one request: a signal that gives up on it. */
export type CallOptions = { readonly signal?: AbortSignal };

export type ApiClient = {
  /** The in-memory credential the next request will send. */
  readonly currentSessionToken: () => string | undefined;
  /** Reads the same in-memory credential that `call` uses before sending a request. */
  readonly isCurrentSession: (session: string) => boolean;
  readonly call: <E extends EndpointShape>(
    endpoint: E,
    input: EndpointInput<E>,
    options?: CallOptions,
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

/** The fetch itself; a request that got no answer is `ApiUnreachable`, one its caller gave up on rethrown. */
const reach = async (doFetch: FetchLike, url: string, init: RequestInit): Promise<Response> => {
  try {
    return await doFetch(url, init);
  } catch (error) {
    if (init.signal?.aborted === true) {
      throw error;
    }
    throw new ApiUnreachable(error instanceof Error ? error.message : String(error));
  }
};

/**
The answer's body. A connection cut while it is read fails as the fetch itself does (a
`TypeError`, per the Fetch standard) and is `ApiUnreachable` too: the headers came, the answer did
not (QA round 17 round-3 review m-b). A body that is not JSON (`SyntaxError`) is an answer, and one
its caller gave up on (`AbortError`) is rethrown for the caller to read.
*/
const readAnswer = async (response: Response, init: RequestInit): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    if (init.signal?.aborted === true || !(error instanceof TypeError)) {
      throw error;
    }
    throw new ApiUnreachable(error.message);
  }
};

/**
Typed HTTP client for the Pace API, driven by the shared endpoint contract. The bearer
token is read on every request so a login or logout takes effect immediately; every request
also says which protocol this build speaks (`X-Pace-Protocol`).
*/
export const createApiClient = (options: {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly token: () => string | undefined;
}): ApiClient => {
  const doFetch: FetchLike = options.fetch ?? (async (input, init) => await fetch(input, init));
  return {
    currentSessionToken: options.token,
    isCurrentSession: (session) => options.token() === session,
    call: async (endpoint, input, callOptions = {}) => {
      const { body, params, query } = input as {
        body?: unknown;
        params?: Record<string, string>;
        query?: Record<string, string>;
      };
      const credential = options.token();
      // The protocol rides on every call: a server too new for this app refuses it (426
      // `client/outdated`), which surfaces as an ApiError like any other refusal.
      const headers: Record<string, string> = {
        Accept: "application/json",
        [PROTOCOL_HEADER]: String(PROTOCOL),
      };
      if (credential !== undefined) {
        headers["Authorization"] = `Bearer ${credential}`;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const url = `${options.baseUrl}${withQuery(buildPath(endpoint.path, params), query)}`;
      const init: RequestInit = {
        ...(body !== undefined && { body: JSON.stringify(body) }),
        headers,
        method: endpoint.method,
        ...(callOptions.signal !== undefined && { signal: callOptions.signal }),
      };
      const response = await reach(doFetch, url, init);
      if (!response.ok) {
        throw await describeError(response);
      }
      return endpoint.output.parse(await readAnswer(response, init)) as EndpointOutput<
        typeof endpoint
      >;
    },
  };
};
