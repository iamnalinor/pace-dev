import { z } from "zod";

import { endpoint, type EndpointShape } from "./endpoint.ts";
import {
  AccountDeletedSchema,
  AuthSessionSchema,
  DevLoginSchema,
  LogoutSchema,
  NonceCreatedSchema,
  NoncePollSchema,
  TelegramLoginSchema,
  UserSchema,
} from "./schemas/auth.ts";
import { LinkPreviewQuerySchema, LinkPreviewSchema } from "./schemas/links.ts";
import {
  DecisionsOutputSchema,
  DecisionsQuerySchema,
  NotifyPlanOutputSchema,
} from "./schemas/notify.ts";
import {
  OAuthClientInfoQuerySchema,
  OAuthClientInfoSchema,
  OAuthCompleteBodySchema,
  OAuthDenyBodySchema,
  OAuthGrantRevokedSchema,
  OAuthGrantsSchema,
  OAuthRedirectSchema,
} from "./schemas/oauth.ts";
import { LlmStatusSchema, ParseRequestSchema, ParseResponseSchema } from "./schemas/parse.ts";
import {
  SyncObservationsBodySchema,
  SyncObservationsOutputSchema,
  SyncPullOutputSchema,
  SyncPullQuerySchema,
  SyncPushBodySchema,
  SyncPushOutputSchema,
} from "./schemas/sync.ts";

/** The whole HTTP contract of the Pace API. Add an endpoint here, mount it in apps/api, call it from @pace/client. */
export const endpoints = {
  health: endpoint({
    auth: false,
    method: "GET",
    output: z.object({ status: z.literal("ok") }),
    path: "/api/health",
  }),
  me: endpoint({
    auth: true,
    method: "GET",
    output: UserSchema,
    path: "/api/me",
  }),
  /** Deletes the account: its event log, sessions, OAuth grants and the user itself. */
  deleteMe: endpoint({
    auth: true,
    method: "DELETE",
    output: AccountDeletedSchema,
    path: "/api/me",
  }),
  auth: {
    /** Web login: the Telegram Login Widget payload, verified against the bot token. */
    telegram: endpoint({
      auth: false,
      body: TelegramLoginSchema,
      method: "POST",
      output: AuthSessionSchema,
      path: "/api/auth/telegram",
    }),
    /** App login, step 1: mint a nonce and the bot deep link that binds it. */
    nonceCreate: endpoint({
      auth: false,
      method: "POST",
      output: NonceCreatedSchema,
      path: "/api/auth/nonce",
    }),
    /** App login, step 2: poll until the bot bound the nonce; `ready` consumes it. */
    noncePoll: endpoint({
      auth: false,
      method: "GET",
      output: NoncePollSchema,
      params: z.object({ nonce: z.string().min(1).max(64) }),
      path: "/api/auth/nonce/:nonce",
    }),
    logout: endpoint({
      auth: true,
      method: "POST",
      output: LogoutSchema,
      path: "/api/auth/logout",
    }),
    /** Local and e2e only: sign in as a whitelisted Telegram id without Telegram. */
    dev: endpoint({
      auth: false,
      body: DevLoginSchema,
      method: "POST",
      output: AuthSessionSchema,
      path: "/api/auth/dev",
    }),
  },
  sync: {
    push: endpoint({
      auth: true,
      body: SyncPushBodySchema,
      method: "POST",
      output: SyncPushOutputSchema,
      path: "/api/sync/push",
    }),
    pull: endpoint({
      auth: true,
      method: "GET",
      output: SyncPullOutputSchema,
      path: "/api/sync/pull",
      query: SyncPullQuerySchema,
    }),
    observations: endpoint({
      auth: true,
      body: SyncObservationsBodySchema,
      method: "POST",
      output: SyncObservationsOutputSchema,
      path: "/api/sync/observations",
    }),
  },
  parse: {
    /** Free text read by the LLM into a task, or changes to one; nothing is saved. */
    run: endpoint({
      auth: true,
      body: ParseRequestSchema,
      method: "POST",
      output: ParseResponseSchema,
      path: "/api/parse",
    }),
    /** Whether a model can answer now (none configured counts as never). */
    status: endpoint({
      auth: true,
      method: "GET",
      output: LlmStatusSchema,
      path: "/api/llm/status",
    }),
  },
  notify: {
    /** The next day's local reminders for the phone: digest windows and deadline crossings. */
    plan: endpoint({
      auth: true,
      method: "GET",
      output: NotifyPlanOutputSchema,
      path: "/api/notify/plan",
    }),
  },
  decisions: {
    /** The decision log (notifications sent or held back, and why), newest first. */
    list: endpoint({
      auth: true,
      method: "GET",
      output: DecisionsOutputSchema,
      path: "/api/decisions",
      query: DecisionsQuerySchema,
    }),
  },
  links: {
    /** Title and icon of a web page, for the link chip on a task (cached by the Worker). */
    preview: endpoint({
      auth: true,
      method: "GET",
      output: LinkPreviewSchema,
      path: "/api/links/preview",
      query: LinkPreviewQuerySchema,
    }),
  },
  /** The MCP consent flow (web consent page ↔ Worker) and the "Connected apps" grants. */
  oauth: {
    /** What to show on the consent page for an authorization request (`authQuery` = its query string). */
    clientInfo: endpoint({
      auth: false,
      method: "GET",
      output: OAuthClientInfoSchema,
      path: "/api/oauth/client-info",
      query: OAuthClientInfoQuerySchema,
    }),
    /** Allow: proves the person's identity (Telegram widget or dev id), stores the grant, returns the client redirect. */
    complete: endpoint({
      auth: false,
      body: OAuthCompleteBodySchema,
      method: "POST",
      output: OAuthRedirectSchema,
      path: "/api/oauth/complete",
    }),
    /** Deny: the client redirect carrying `error=access_denied`. */
    deny: endpoint({
      auth: false,
      body: OAuthDenyBodySchema,
      method: "POST",
      output: OAuthRedirectSchema,
      path: "/api/oauth/deny",
    }),
    grants: {
      list: endpoint({
        auth: true,
        method: "GET",
        output: OAuthGrantsSchema,
        path: "/api/oauth/grants",
      }),
      /** Revoking a grant invalidates its access and refresh tokens at once. */
      revoke: endpoint({
        auth: true,
        method: "DELETE",
        output: OAuthGrantRevokedSchema,
        params: z.object({ id: z.string().min(1).max(128) }),
        path: "/api/oauth/grants/:id",
      }),
    },
  },
} as const;

const isEndpoint = (value: unknown): value is EndpointShape =>
  typeof value === "object" && value !== null && "method" in value && "path" in value;

const flatten = (group: object): readonly EndpointShape[] =>
  Object.values(group).flatMap((value: unknown) =>
    isEndpoint(value) ? [value] : flatten(value as object),
  );

/** Every endpoint of the contract, flat — for mounting guards and contract tests. */
export const endpointList: readonly EndpointShape[] = flatten(endpoints);
