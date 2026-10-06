import { z } from "zod";

import { endpoint, type EndpointShape } from "./endpoint.ts";
import {
  AuthSessionSchema,
  DevLoginSchema,
  LogoutSchema,
  NonceCreatedSchema,
  NoncePollSchema,
  TelegramLoginSchema,
  UserSchema,
} from "./schemas/auth.ts";
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
} as const;

const isEndpoint = (value: unknown): value is EndpointShape =>
  typeof value === "object" && value !== null && "method" in value && "path" in value;

const flatten = (group: object): readonly EndpointShape[] =>
  Object.values(group).flatMap((value: unknown) =>
    isEndpoint(value) ? [value] : flatten(value as object),
  );

/** Every endpoint of the contract, flat — for mounting guards and contract tests. */
export const endpointList: readonly EndpointShape[] = flatten(endpoints);
