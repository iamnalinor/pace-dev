import {
  buildPath,
  type EndpointInput,
  type EndpointOutput,
  type EndpointShape,
  PROTOCOL,
  PROTOCOL_HEADER,
} from "@pace/core";

import { heldUntilChecked } from "./held-call.ts";

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

/**
What a caller may add to one request: a signal that gives up on it, a credential sent instead of
the one in use, and `keepalive` for a small request sent without awaiting it that must outlive the
page (a reload or a closed tab right after; the browser caps such bodies at 64 KB).
*/
export type CallOptions = {
  readonly credential?: string;
  readonly keepalive?: boolean;
  readonly signal?: AbortSignal;
};

export type ApiClient = {
  /** The in-memory credential the next request will send. */
  readonly currentSessionToken: () => string | undefined;
  /** Reads the same in-memory credential that `call` uses before sending a request. */
  readonly isCurrentSession: (session: string) => boolean;
  /**
  `options.credential` sends that token instead of the one in use: a logout, sent after this
  device forgot its session, still names the session it ends.
  */
  readonly call: <E extends EndpointShape>(
    endpoint: E,
    input: EndpointInput<E>,
    options?: CallOptions,
  ) => Promise<EndpointOutput<E>>;
};

/** What the Worker answers a call that needs a session and names none (`requireAuth`). */
const UNAUTHORIZED = "auth/unauthorized";

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

/** The request as `fetch` takes it, with what the caller added (a signal, keepalive). */
const requestInit = (
  {
    body,
    headers,
    method,
  }: { readonly body: unknown; readonly headers: HeadersInit; readonly method: string },
  { keepalive, signal }: CallOptions,
): RequestInit => ({
  ...(body !== undefined && { body: JSON.stringify(body) }),
  headers,
  method,
  ...(signal !== undefined && { signal }),
  ...(keepalive === true && { keepalive: true }),
});

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

type ApiClientOptions = {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly token: () => string | undefined;
  /**
  A call that carried `credential` was answered 401: the session may have ended. Heard before the
  call fails, with the endpoint it was.
  */
  readonly onUnauthorized?: (credential: string, endpoint: EndpointShape) => void;
  /** Whether this device's session ended and no new one began: nothing that needs one is sent. */
  readonly sessionEnded?: () => boolean;
  /**
  A check of the session in use that is under way (a 401 heard, `me` on its way), or `undefined`.
  A call that would send that session waits for its answer and then sends whatever is current (or
  nothing, once it ended): the session's end is never sent again while it is being confirmed (CI
  run 41668309388). `me` and the log-out are never held: the check is `me`.
  */
  readonly sessionCheck?: (endpoint: EndpointShape) => Promise<unknown> | undefined;
};

/**
The token a call sends, read once a check of the session under way is answered (a call naming its
own credential, the log-out, waits for nothing); none for a call that needs one once the session
ended (it throws).
*/
const credentialFor = async (
  options: ApiClientOptions,
  endpoint: EndpointShape,
  callOptions: CallOptions,
): Promise<string | undefined> => {
  const checking =
    endpoint.auth && callOptions.credential === undefined
      ? options.sessionCheck?.(endpoint)
      : undefined;
  if (checking !== undefined) {
    await heldUntilChecked(checking, callOptions.signal);
  }
  const credential = callOptions.credential ?? options.token();
  if (credential === undefined && endpoint.auth && options.sessionEnded?.() === true) {
    throw new ApiError(401, UNAUTHORIZED, "Not signed in");
  }
  return credential;
};

/**
Typed HTTP client for the Pace API, driven by the shared endpoint contract. The bearer
token is read on every request so a login or logout takes effect immediately; every request
also says which protocol this build speaks (`X-Pace-Protocol`).

Once this device's session has ended (`sessionEnded`: signed out by hand, from the list or by a
401), a call whose contract needs a session (`auth: true`, the flag the Worker mounts its guard
from) is not sent without one: it fails here with the server's own 401 `auth/unauthorized`, so a
screen or a loop still running after the sign-out asks nothing (QA round 22 R22-02). A device that
never had a session reaches no screen that makes such calls (the route gate).
*/
export const createApiClient = (options: ApiClientOptions): ApiClient => {
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
      const credential = await credentialFor(options, endpoint, callOptions);
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
      const init = requestInit({ body, headers, method: endpoint.method }, callOptions);
      const response = await reach(doFetch, url, init);
      if (!response.ok) {
        if (credential !== undefined && response.status === 401) {
          options.onUnauthorized?.(credential, endpoint);
        }
        throw await describeError(response);
      }
      return endpoint.output.parse(await readAnswer(response, init)) as EndpointOutput<
        typeof endpoint
      >;
    },
  };
};
