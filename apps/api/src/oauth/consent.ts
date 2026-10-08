import type { Context } from "hono";

import {
  AuthorizationError,
  type AuthRequest,
  CimdFetchError,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";

import { err, ok, type Result } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Problem } from "../shared/mount.ts";

import { oauthHelpers } from "../shared/oauth-helpers.ts";

/** An authorization request the provider refused, as the consent page should report it. */
export type AuthProblem = Problem & {
  /** The client's redirect URI with the OAuth error, when the provider validated the client. */
  readonly redirectTo?: string;
};

/**
Maps what `parseAuthRequest` throws to a problem. An `AuthorizationError` is the client's
fault (unknown client, bad redirect URI, missing PKCE); a `CimdFetchError` means the
client's metadata document could not be fetched. Anything else is a bug or an outage.
*/
const describeFailure = (error: unknown): AuthProblem => {
  if (error instanceof AuthorizationError) {
    return {
      code: "oauth/invalid-request",
      message: error.description,
      status: 400,
      ...(error.redirectTo !== undefined && { redirectTo: error.redirectTo }),
    };
  }
  if (error instanceof CimdFetchError) {
    return {
      code: "oauth/client-unverified",
      message: "This app could not be verified",
      status: 400,
    };
  }
  throw error;
};

/** Validates an authorization request the way `GET /authorize` sees it. */
export const parseAuthorization = async (
  c: Context<AppEnv>,
  request: Request,
): Promise<Result<AuthRequest, AuthProblem>> => {
  try {
    return ok(await oauthHelpers(c).parseAuthRequest(request));
  } catch (error) {
    return err(describeFailure(error));
  }
};

export type Consent = {
  readonly request: AuthRequest;
  readonly details: ConsentDescription;
};

/**
Rebuilds the authorization request the consent page carries (`authQuery` is the query
string `GET /authorize` received) and validates it again: the page never sees a request
the provider did not accept, and nothing it posts is trusted beyond that string.
*/
export const loadConsent = async (
  c: Context<AppEnv>,
  authQuery: string,
): Promise<Result<Consent, AuthProblem>> => {
  const helpers = oauthHelpers(c);
  const url = `${new URL(c.req.url).origin}/authorize?${authQuery}`;
  try {
    const request = await helpers.parseAuthRequest(new Request(url));
    return ok({ details: await helpers.describeConsent(request), request });
  } catch (error) {
    return err(describeFailure(error));
  }
};
