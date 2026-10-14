import { eq } from "drizzle-orm";

import { brokenPushMethods } from "../db/d1-schema.ts";
import { d1 } from "../db/d1.ts";
import { type FcmTarget, fcmTargetOf } from "../fcm.ts";
import { createLogger } from "../logger.ts";
import { fcmTransport } from "./fcm-transport.ts";
import { type PollQueue, pollTransport } from "./poll-transport.ts";
import { PUSH_METHODS, type PushMethod, type PushTransport } from "./transport.ts";

/**
What the push methods need: the Worker's configuration (secrets; `fcm` `null` = off) and, inside
a user's store, its poll queue (absent elsewhere: the method is accepted, nothing queued).
*/
export type PushConfig = {
  readonly fcm: FcmTarget | null;
  readonly poll?: PollQueue | undefined;
};

/** The push configuration the Worker's bindings give (read per call, never at module scope). */
export const pushConfigOf = (env: {
  readonly FIREBASE_SERVICE_ACCOUNT?: string | undefined;
}): PushConfig => ({ fcm: fcmTargetOf(env) });

/** A stand-in for the poll queue outside a store: the method is always accepted. */
const NO_QUEUE: PollQueue = {
  enqueue: async () => {
    await Promise.resolve();
  },
};

const FACTORIES: Readonly<Record<PushMethod, (config: PushConfig) => null | PushTransport>> = {
  fcm: (config) => (config.fcm === null ? null : fcmTransport(config.fcm)),
  poll: (config) => pollTransport(config.poll ?? NO_QUEUE),
};

const isMethod = (value: string): value is PushMethod =>
  (PUSH_METHODS as readonly string[]).includes(value);

/** The transport of a device's push method; `null` when the method is unknown or not configured. */
export const transportFor = (config: PushConfig, method: string): null | PushTransport =>
  isMethod(method) ? FACTORIES[method](config) : null;

/**
The methods this server accepts now: configured, and not found broken with the credentials it
has (new credentials clear that).
*/
export const acceptedMethods = async (
  binding: D1Database,
  config: PushConfig,
): Promise<readonly PushMethod[]> => {
  const broken = await d1(binding).select().from(brokenPushMethods);
  return PUSH_METHODS.filter((method) => {
    const transport = FACTORIES[method](config);
    return (
      transport !== null &&
      broken.every((row) => !(row.method === method && row.fingerprint === transport.fingerprint))
    );
  });
};

/**
Marks a method broken for everyone: its credentials were refused (not one device's bad token).
It stops being offered and used until the credentials change.
*/
export const markBroken = async (
  binding: D1Database,
  transport: PushTransport,
  { now, reason }: { readonly now: number; readonly reason: string },
): Promise<void> => {
  createLogger("info").error("A push method stopped working", { method: transport.method, reason });
  const row = {
    brokenAt: new Date(now),
    fingerprint: transport.fingerprint,
    method: transport.method,
    reason,
  };
  await d1(binding)
    .insert(brokenPushMethods)
    .values(row)
    .onConflictDoUpdate({ set: row, target: brokenPushMethods.method });
};

/** Whether `method` is broken with the credentials the transport has now. */
export const isBroken = async (binding: D1Database, transport: PushTransport): Promise<boolean> => {
  const [row] = await d1(binding)
    .select()
    .from(brokenPushMethods)
    .where(eq(brokenPushMethods.method, transport.method));
  return row?.fingerprint === transport.fingerprint;
};
