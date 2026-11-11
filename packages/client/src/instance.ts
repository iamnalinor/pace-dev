import {
  compatibility,
  endpoints,
  err,
  type FirebaseConfigReason,
  type Instance,
  ok,
  type Result,
} from "@pace/core";

import { ApiError, createApiClient } from "./api-client.ts";

/** Why a server cannot be used: configuration, availability, identity or compatibility. */
export type InstanceError =
  | "client-outdated"
  | "not-pace"
  | "server-outdated"
  | "unreachable"
  | { readonly kind: "server-misconfigured"; readonly reason: FirebaseConfigReason | null };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
Only two answers say the server is not a Pace this app can read: no route (404) and a JSON answer
that is not an instance. A typed configuration failure is preserved for recovery. Anything else in the way (a 5xx, a rate limit, a firewall's challenge, a
proxy asking to sign in, a captive portal's web page, no network) is the path to the server, which
may well be a fitting Pace: it must never read as a version mismatch.
*/
const failureOf = (error: unknown): Result<never, InstanceError> => {
  if (error instanceof ApiError) {
    if (error.status === 500 && error.code === "server/misconfigured") {
      return err({ kind: "server-misconfigured", reason: error.configurationReason });
    }
    return err(error.status === 404 ? "not-pace" : "unreachable");
  }
  return err(error instanceof Error && error.name === "ZodError" ? "not-pace" : "unreachable");
};

/**
What the server at `baseUrl` says about itself (`GET /api/instance`, no session), and whether it
fits this app. A 404 is a server without the route: someone else's, or a Pace older than the
route (the app decides which it treats it as, by whether the person just typed the address).
*/
export const checkInstance = async (
  baseUrl: string,
  fetch?: FetchLike,
): Promise<Result<Instance, InstanceError>> => {
  const api = createApiClient({
    baseUrl,
    ...(fetch !== undefined && { fetch }),
    token: () => undefined,
  });
  return await checkInstanceWith(async () => await api.call(endpoints.instance, {}));
};

/** `checkInstance` over a reader of the instance (one a client shares, `createInstanceReader`). */
export const checkInstanceWith = async (
  read: () => Promise<Instance>,
): Promise<Result<Instance, InstanceError>> => {
  let instance: Instance;
  try {
    instance = await read();
  } catch (error) {
    return failureOf(error);
  }
  const fit = compatibility(instance);
  return fit === "ok" ? ok(instance) : err(fit);
};

/** One client's reading of its server's instance (`createInstanceReader`). */
export type InstanceReader = {
  /** Asks the server now; a read already out is joined (two checks at once make one request). */
  readonly read: () => Promise<Instance>;
  /**
  The last answer, whatever its age, or a read when there is none: for what is decided once per
  client (the checkpoint negotiation), never for a check that must be current.
  */
  readonly latest: () => Promise<Instance>;
};

/**
One client's reading of its server's instance, so the start's server check and the checkpoint
negotiation make one request, not two a moment apart (QA PR55-1-12). A failure is never kept: the
next read asks again; a check that must be current (a return to the app) always asks.
*/
export const createInstanceReader = (fetchInstance: () => Promise<Instance>): InstanceReader => {
  let pending: Promise<Instance> | undefined;
  let last: Instance | undefined;
  const read = async (): Promise<Instance> => {
    pending ??= (async () => {
      try {
        last = await fetchInstance();
        return last;
      } finally {
        pending = undefined;
      }
    })();
    return await pending;
  };
  return { latest: async () => last ?? (await read()), read };
};
