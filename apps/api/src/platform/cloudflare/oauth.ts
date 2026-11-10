import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

import { err, ok, type Result } from "@pace/core";

import type { AuthProblem, OAuth } from "../../shared/ports/oauth.ts";

const resultOf = async <T>(call: () => Promise<T>): Promise<Result<T, AuthProblem>> => {
  try {
    return ok(await call());
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return err({
        code: "oauth/invalid-request",
        message: error.description,
        status: 400,
        ...(error.redirectTo !== undefined && { redirectTo: error.redirectTo }),
      });
    }
    if (error instanceof CimdFetchError) {
      return err({
        code: "oauth/client-unverified",
        message: "This app could not be verified",
        status: 400,
      });
    }
    throw error;
  }
};

export const oauth = (helpers: OAuthHelpers): OAuth => ({
  completeAuthorization: async (options) => await helpers.completeAuthorization(options),
  deny: (request) => authorizationErrorRedirect(request, "access_denied"),
  describeConsent: async (request) =>
    await resultOf(async () => await helpers.describeConsent(request)),
  parseAuthRequest: async (request) =>
    await resultOf(async () => await helpers.parseAuthRequest(request)),
});
