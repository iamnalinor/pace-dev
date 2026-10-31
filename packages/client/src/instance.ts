import { compatibility, endpoints, err, type Instance, ok, type Result } from "@pace/core";

import { ApiError, createApiClient } from "./api-client.ts";

/** Why a server cannot be used: down or offline, not a Pace server, or a version that does not fit. */
export type InstanceError = "client-outdated" | "not-pace" | "server-outdated" | "unreachable";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** A refusal the server worded (4xx) means it is there but no Pace; a 5xx is a Pace that is down. */
const failureOf = (error: unknown): InstanceError => {
  if (error instanceof ApiError) {
    return error.status >= 500 ? "unreachable" : "not-pace";
  }
  // An answer that is not JSON (a web page) or not an instance (zod) comes from another server.
  return error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")
    ? "not-pace"
    : "unreachable";
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
