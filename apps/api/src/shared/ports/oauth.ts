import type { Result } from "@pace/core";

import type { GrantMetadata } from "../oauth-grants.ts";
import type { Problem } from "../problem.ts";

export type AuthRequest = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  resource?: string;
  issuer?: string;
};

export type ConsentDescription = {
  clientId: string;
  clientName: string;
  clientDomain?: string;
  clientUri?: string;
  logoUri?: string;
  redirectUri: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  scope: string[];
};

export type AuthProblem = Problem & { readonly redirectTo?: string };

/** Only consent operations the application needs; provider failures are mapped by its adapter. */
export type OAuth = {
  readonly parseAuthRequest: (request: Request) => Promise<Result<AuthRequest, AuthProblem>>;
  readonly describeConsent: (
    request: AuthRequest,
  ) => Promise<Result<ConsentDescription, AuthProblem>>;
  readonly completeAuthorization: (options: {
    readonly metadata: GrantMetadata;
    readonly props: { readonly telegramId: string; readonly userId: string };
    readonly request: AuthRequest;
    readonly scope: string[];
    readonly userId: string;
  }) => Promise<{ readonly redirectTo: string }>;
  readonly deny: (request: AuthRequest) => string;
};
