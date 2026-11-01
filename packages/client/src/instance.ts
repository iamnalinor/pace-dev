import { compatibility, endpoints, err, type Instance, ok, type Result } from "@pace/core";

import { ApiError, createApiClient } from "./api-client.ts";

/** Why a server cannot be used: down or offline, not a Pace server, or a version that does not fit. */
export type InstanceError = "client-outdated" | "not-pace" | "server-outdated" | "unreachable";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
Only two answers say the server is not a Pace this app can read: no route (404) and a JSON answer
that is not an instance. Anything else in the way (a 5xx, a rate limit, a firewall's challenge, a
proxy asking to sign in, a captive portal's web page, no network) is the path to the server, which
may well be a fitting Pace: it must never read as a version mismatch.
*/
const failureOf = (error: unknown): InstanceError => {
  if (error instanceof ApiError) {
    return error.status === 404 ? "not-pace" : "unreachable";
  }
  return error instanceof Error && error.name === "ZodError" ? "not-pace" : "unreachable";
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
  let instance: Instance;
  try {
    instance = await api.call(endpoints.instance, {});
  } catch (error) {
    return err(failureOf(error));
  }
  const fit = compatibility(instance);
  return fit === "ok" ? ok(instance) : err(fit);
};
