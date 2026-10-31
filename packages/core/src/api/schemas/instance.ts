import { z } from "zod";

import { knownOrNull, knownValues } from "../tolerant.ts";

/** The ways a person can sign in on this server. */
const LOGIN_METHODS = ["telegram-widget", "telegram-deeplink"] as const;

/**
What a server says about itself before anyone signs in (`GET /api/instance`): the app checks the
protocol against its own (`compatibility`) and shows the name, version and bot when the person
picks a server. Parts a newer server may grow are read tolerantly.
*/
export const InstanceSchema = z.object({
  name: z.string(),
  /** The server's build: a release tag or a commit, `dev` outside a deploy. */
  version: z.string(),
  protocol: z.number().int(),
  minClientProtocol: z.number().int(),
  /** The Telegram bot the server signs in with (the deep link goes to it). */
  botUsername: z.string(),
  /** The web app served with this server; `null` when there is none. */
  webOrigin: knownOrNull(z.string()),
  apiOrigin: z.string(),
  /** A method this client does not know (a newer server's) is dropped. */
  loginMethods: knownValues(z.enum(LOGIN_METHODS)),
  /** A feature a server does not mention is off. */
  features: z.object({
    push: z.boolean().default(false),
    assistant: z.boolean().default(false),
  }),
});

export type Instance = z.output<typeof InstanceSchema>;
