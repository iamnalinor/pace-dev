import type { Hono } from "hono";

import { endpoints, err, ok, type Session } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { d1 } from "../shared/db/d1.ts";
import { mount, type Problem } from "../shared/mount.ts";
import { type Grant, listGrants, revokeGrant } from "../shared/oauth-grants.ts";
import { deleteSession } from "../shared/session-rows.ts";
import { userStoreOf } from "../shared/user-store-of.ts";
import { createSession, type ListedSession, listSessions } from "./sessions.ts";

/** An agent's token lasts five years: a computer sends quietly in the background. */
const AGENT_DAYS = 5 * 365;

/** An MCP app's grant is listed among the sessions under this prefix. */
const MCP_PREFIX = "mcp:";

const SESSION_NOT_FOUND: Problem = {
  code: "session/not-found",
  message: "No such session",
  status: 404,
};

const fromRow = (
  row: ListedSession,
  context: { readonly currentId: string | undefined; readonly dataAt: ReadonlyMap<string, string> },
): Session => ({
  city: row.city,
  country: row.country,
  createdAt: row.createdAt,
  current: row.id === context.currentId,
  id: row.id,
  ip: row.ip,
  kind: row.kind,
  lastDataAt: row.usageDevice === null ? null : (context.dataAt.get(row.usageDevice) ?? null),
  lastSeenAt: row.lastSeenAt,
  name: row.name,
});

const fromGrant = (grant: Grant): Session => ({
  city: null,
  country: null,
  createdAt: grant.createdAt,
  current: false,
  id: `${MCP_PREFIX}${grant.id}`,
  ip: null,
  kind: "mcp",
  lastDataAt: null,
  lastSeenAt: null,
  name: grant.clientName,
  scopes: [...grant.scopes],
});

/**
Settings → Devices and sessions: every way into the account (D1 sessions of every kind and the
MCP apps' grants), each revocable here; and connecting a computer, whose agent token may only
upload its usage and is shown once.
*/
export const mountSessionRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.sessions.list, async ({ c }) => {
    const userId = requireUser(c).id;
    const [rows, reporting, grants] = await Promise.all([
      listSessions(d1(c.env.DB), userId, Date.now()),
      userStoreOf(c).usageDevices(),
      listGrants(c.env.OAUTH_KV, userId),
    ]);
    const context = {
      currentId: c.get("sessionId"),
      dataAt: new Map(reporting.map((entry) => [entry.deviceId, entry.at])),
    };
    return ok({
      sessions: [
        ...rows.map((row) => fromRow(row, context)),
        ...grants.map((grant) => fromGrant(grant)),
      ],
    });
  });
  mount(app, endpoints.sessions.revoke, async ({ c, params }) => {
    const userId = requireUser(c).id;
    const isRevoked = params.id.startsWith(MCP_PREFIX)
      ? await revokeGrant(c.env.OAUTH_KV, userId, params.id.slice(MCP_PREFIX.length))
      : await deleteSession(d1(c.env.DB), { sessionId: params.id, userId }, userStoreOf(c));
    return isRevoked ? ok({ ok: true as const }) : err(SESSION_NOT_FOUND);
  });
  mount(app, endpoints.sessions.createAgent, async ({ body, c }) => {
    const created = await createSession(d1(c.env.DB), {
      days: AGENT_DAYS,
      kind: "agent",
      name: body.name,
      now: Date.now(),
      scope: "usage:write",
      userId: requireUser(c).id,
    });
    return ok({ id: created.id, name: body.name, token: created.token });
  });
};
