import type { Context } from "hono";

import { ok, type Result } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { AuthProblem, AuthRequest, ConsentDescription } from "../shared/ports/oauth.ts";

import { oauthHelpers } from "../shared/oauth-helpers.ts";

/** Validates an authorization request the way `GET /authorize` sees it. */
export const parseAuthorization = async (
  c: Context<AppEnv>,
  request: Request,
): Promise<Result<AuthRequest, AuthProblem>> => {
  return await oauthHelpers(c).parseAuthRequest(request);
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
  const parsed = await helpers.parseAuthRequest(new Request(url));
  if (!parsed.ok) {
    return parsed;
  }
  const details = await helpers.describeConsent(parsed.value);
  return details.ok ? ok({ details: details.value, request: parsed.value }) : details;
};
