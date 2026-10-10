import type { Hono } from "hono";

import { type Device, endpoints, err, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { d1 } from "../shared/db/d1.ts";
import { mount } from "../shared/mount.ts";
import { userStoreOf } from "../shared/user-store-of.ts";
import {
  createSession,
  type DeviceSession,
  listDeviceSessions,
  revokeDeviceSession,
} from "./sessions.ts";

/** A device token lasts five years: a computer sends quietly in the background. */
const DEVICE_DAYS = 5 * 365;

type Reporting = { readonly deviceId: string; readonly deviceName: string; readonly at: string };

/**
The computers with their token (a computer reports under its token's id) and every other
device that sent usage (a phone), the most recently active first.
*/
const devicesOf = (
  tokens: readonly DeviceSession[],
  reporting: readonly Reporting[],
): readonly Device[] => {
  const lastOf = new Map(reporting.map((entry) => [entry.deviceId, entry.at]));
  const computers = tokens.map((token) => ({
    connectedAt: token.createdAt,
    id: token.id,
    kind: "computer" as const,
    lastActivityAt: lastOf.get(token.id) ?? null,
    lastSeenAt: token.lastSeenAt,
    name: token.name,
  }));
  const known = new Set(tokens.map((token) => token.id));
  const phones = reporting
    .filter((entry) => !known.has(entry.deviceId))
    .map((entry) => ({
      connectedAt: null,
      id: entry.deviceId,
      kind: "phone" as const,
      lastActivityAt: entry.at,
      lastSeenAt: null,
      name: entry.deviceName,
    }));
  return [...computers, ...phones].toSorted((a, b) =>
    (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  );
};

/**
Computers connected with a token of their own: it may only upload the computer's app usage
(`usage:write`), is shown once, and is listed and revoked from Settings.
*/
export const mountDeviceRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.devices.list, async ({ c }) => {
    const userId = requireUser(c).id;
    const tokens = await listDeviceSessions(d1(c.env.DB), userId);
    return ok({ devices: [...devicesOf(tokens, await userStoreOf(c).usageDevices())] });
  });
  mount(app, endpoints.devices.create, async ({ body, c }) => {
    const now = Date.now();
    const created = await createSession(d1(c.env.DB), {
      days: DEVICE_DAYS,
      label: body.name,
      now,
      scope: "usage:write",
      userId: requireUser(c).id,
    });
    return ok({ id: created.id, name: body.name, token: created.token });
  });
  mount(app, endpoints.devices.revoke, async ({ c, params }) => {
    const revoked = await revokeDeviceSession(d1(c.env.DB), {
      id: params.id,
      userId: requireUser(c).id,
    });
    return revoked > 0
      ? ok({ ok: true as const })
      : err({ code: "device/unknown", message: "No such device", status: 404 });
  });
};
