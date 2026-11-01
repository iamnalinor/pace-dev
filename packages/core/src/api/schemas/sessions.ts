import { z } from "zod";

import { knownValue, knownValues } from "../tolerant.ts";

/** What holds access to the account: a browser, the phone app, a computer's agent, a dev login, an MCP app. */
const SESSION_KINDS = ["browser", "app", "agent", "dev", "mcp"] as const;

/**
One way into the account (`GET /api/sessions`): a signed-in browser or phone, a computer's agent
token, or an MCP app's grant (id `mcp:<grant>`). `lastDataAt` is the end of the newest app usage
the app or the agent sent; `current` marks the session the request came with.
*/
export const SessionSchema = z.object({
  id: z.string(),
  /** A kind a newer server added reads as a browser: shown, revocable like one. */
  kind: knownValue(SESSION_KINDS, "browser"),
  name: z.string(),
  ip: z.string().nullable(),
  /** ISO 3166 code as Cloudflare reports it ("DE"; "T1" for Tor). */
  country: z.string().nullable(),
  city: z.string().nullable(),
  createdAt: z.number(),
  lastSeenAt: z.number().nullable(),
  lastDataAt: z.iso.datetime().nullable(),
  current: z.boolean(),
  /** An MCP app's permissions. */
  scopes: z.array(z.string()).optional(),
});

export type Session = z.output<typeof SessionSchema>;

export const SessionsOutputSchema = z.object({ sessions: knownValues(SessionSchema) });
