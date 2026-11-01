import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, eq, gt, lt, max, notInArray, sql } from "drizzle-orm";

import type { CalendarEvent, Interval, UsageRow } from "@pace/core";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** [from, to): the rows of a table that overlap it. */
export type Range = { readonly from: string; readonly to: string };

/** A phone's calendar copy over a range, with the series it answers "every time" for. */
export type CalendarUpload = Range & {
  readonly deviceId: string;
  readonly events: readonly CalendarEvent[];
  readonly ruledSeries?: readonly string[] | undefined;
};

/** A phone's calendar over a range: its earlier copy of that range goes, the new one comes in. */
export const replaceCalendar = async (
  db: Db,
  { deviceId, events, from, to }: CalendarUpload,
): Promise<number> => {
  const { calendarEvents } = schema;
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.deviceId, deviceId),
        lt(calendarEvents.startAt, to),
        gt(calendarEvents.endAt, from),
      ),
    );
  for (const event of events) {
    await db
      .insert(calendarEvents)
      .values({
        attendeeCount: event.attendeeCount ?? null,
        calendarName: event.calendarName ?? null,
        deviceId,
        endAt: event.endAt,
        eventId: event.id,
        location: event.location ?? null,
        notes: event.notes ?? null,
        organizer: event.organizer ?? null,
        series: event.series,
        startAt: event.startAt,
        title: event.title,
        url: event.url ?? null,
      })
      .onConflictDoNothing();
  }
  return events.length;
};

/**
The calendar's events overlapping a range, each occurrence once: two phones send the same event
under their own local ids, so the same title and times count as one.
*/
export const listCalendar = async (
  db: Db,
  { from, to }: Range,
): Promise<readonly CalendarEvent[]> => {
  const { calendarEvents } = schema;
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(lt(calendarEvents.startAt, to), gt(calendarEvents.endAt, from)))
    .orderBy(calendarEvents.startAt);
  return rows
    .filter(
      (row, index) =>
        rows.findIndex(
          (other) =>
            other.title === row.title && other.startAt === row.startAt && other.endAt === row.endAt,
        ) === index,
    )
    .map((row) => ({
      endAt: row.endAt,
      id: row.eventId,
      series: row.series,
      startAt: row.startAt,
      title: row.title,
      ...detailsOf(row),
    }));
};

type DetailKey = "attendeeCount" | "calendarName" | "location" | "notes" | "organizer" | "url";

/** The details a row has, each left out when the phone did not tell it (`null` in the table). */
const detailsOf = (
  row: typeof schema.calendarEvents.$inferSelect,
): Partial<Pick<CalendarEvent, DetailKey>> => ({
  ...(row.location !== null && { location: row.location }),
  ...(row.notes !== null && { notes: row.notes }),
  ...(row.url !== null && { url: row.url }),
  ...(row.calendarName !== null && { calendarName: row.calendarName }),
  ...(row.organizer !== null && { organizer: row.organizer }),
  ...(row.attendeeCount !== null && { attendeeCount: row.attendeeCount }),
});

export const clearCalendar = async (db: Db, deviceId: string): Promise<void> => {
  await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.deviceId, deviceId));
};

/** One device's upload: its app sessions and, from a phone, its uses and how far it read. */
export type UsageUpload = {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly sessions: readonly Omit<UsageRow, "deviceId" | "deviceName">[];
  readonly uses?: readonly Interval[] | undefined;
  readonly until?: string | undefined;
  /** Sent by a phone (a full sign-in), not by a computer's agent token. */
  readonly isPhone: boolean;
};

/** How far a device's usage is known, as its latest upload said. */
type KnownUsage = {
  /** The end of what it read: quiet up to here is known quiet. */
  readonly until: string;
  readonly isPhone: boolean;
  readonly uploadedAt: string;
};

const KNOWN_PREFIX = "usage:known:";

/** A phone that has not uploaded for this long says nothing about now (Ruling 5). */
const KNOWN_FOR_MS = 24 * 60 * 60 * 1000;

/**
Remembers how far the device's usage is known. A phone says it with `until` on the last request
of an upload; a phone request without one (an older app, or an earlier batch) leaves the record
as it was, so an older app never makes a quiet it did not read look known. A computer's upload
counts up to when it arrived. Never past that moment: a phone clock running ahead claims nothing.
*/
const noteKnown = async (
  storage: DurableObjectStorage,
  upload: UsageUpload,
  now: string,
): Promise<void> => {
  if (upload.isPhone && upload.until === undefined) {
    return;
  }
  const until = upload.until === undefined || upload.until > now ? now : upload.until;
  const known: KnownUsage = { isPhone: upload.isPhone, until, uploadedAt: now };
  await storage.put(`${KNOWN_PREFIX}${upload.deviceId}`, known);
};

/** A phone's uses: one per start, a use seen again (it was still going on) keeps the later end. */
const addPhoneUses = async (
  db: Db,
  deviceId: string,
  uses: readonly Interval[],
): Promise<number> => {
  const { phoneUses } = schema;
  // A use whose screen-off was lost is only known to have started: it ends where it began.
  const valid = uses.filter((use) => use.endAt >= use.startAt);
  for (const use of valid) {
    await db
      .insert(phoneUses)
      .values({ deviceId, endAt: use.endAt, startAt: use.startAt })
      .onConflictDoUpdate({
        set: { endAt: sql`max(${phoneUses.endAt}, excluded.end_at)` },
        target: [phoneUses.deviceId, phoneUses.startAt],
      });
  }
  return valid.length;
};

/**
A device's sessions (a session seen again, same app and start, keeps the later end), a phone's
uses, and how far the device's usage is known. Rows stored.
*/
export const addUsage = async (
  { db, storage }: { readonly db: Db; readonly storage: DurableObjectStorage },
  upload: UsageUpload,
  now: string,
): Promise<number> => {
  const { usageSessions } = schema;
  const valid = upload.sessions.filter((session) => session.endAt > session.startAt);
  for (const session of valid) {
    await db
      .insert(usageSessions)
      .values({ ...session, deviceId: upload.deviceId, deviceName: upload.deviceName })
      .onConflictDoUpdate({
        set: {
          deviceName: upload.deviceName,
          endAt: sql`max(${usageSessions.endAt}, excluded.end_at)`,
        },
        target: [usageSessions.deviceId, usageSessions.app, usageSessions.startAt],
      });
  }
  // A computer's use is its sessions (its agent reads idle time); only a phone's uses are kept.
  const uses = upload.isPhone ? await addPhoneUses(db, upload.deviceId, upload.uses ?? []) : 0;
  await noteKnown(storage, upload, now);
  return valid.length + uses;
};

/** A stretch someone used one of the devices. */
export type DeviceUse = { deviceId: string; startAt: string; endAt: string };

/** Use on every device, and how far the phones' usage is known (`null`: nothing to decide on). */
export type SleepUsage = {
  readonly uses: readonly DeviceUse[];
  readonly knownUntil: null | string;
};

const byStartThenDevice = (a: DeviceUse, b: DeviceUse): number => {
  const byStart = a.startAt.localeCompare(b.startAt);
  return byStart === 0 ? a.deviceId.localeCompare(b.deviceId) : byStart;
};

/** The earliest `until` among the phones that uploaded after `fresh`; `null` when none did. */
const knownUntilOf = (
  phones: readonly (KnownUsage & { readonly deviceId: string })[],
  fresh: string,
): null | string =>
  phones
    .filter((phone) => phone.uploadedAt > fresh)
    .map((phone) => phone.until)
    .toSorted((a, b) => a.localeCompare(b))
    .at(0) ?? null;

/**
What automatic sleep reads from `from` on: the phones' uses and the other devices' app sessions
(a phone's own sessions are not use: an alarm over the lock screen is one), by start; and how far
that is known, the earliest `until` among the phones that uploaded within a day (`null` when none
did: nothing can be decided). A computer bounds nothing: switched off at night it stops sending.
*/
export const usageForSleep = async (
  { db, storage }: { readonly db: Db; readonly storage: DurableObjectStorage },
  { from, now }: { readonly from: string; readonly now: string },
): Promise<SleepUsage> => {
  const { phoneUses, usageSessions } = schema;
  const known = [...(await storage.list<KnownUsage>({ prefix: KNOWN_PREFIX }))];
  const phones = known
    .filter(([, record]) => record.isPhone)
    .map(([key, record]) => ({ deviceId: key.slice(KNOWN_PREFIX.length), ...record }));
  const phoneRows = await db
    .select({ deviceId: phoneUses.deviceId, endAt: phoneUses.endAt, startAt: phoneUses.startAt })
    .from(phoneUses)
    .where(gt(phoneUses.endAt, from));
  const phoneIds = phones.map((phone) => phone.deviceId);
  const otherRows = await db
    .select({
      deviceId: usageSessions.deviceId,
      endAt: usageSessions.endAt,
      startAt: usageSessions.startAt,
    })
    .from(usageSessions)
    .where(and(gt(usageSessions.endAt, from), notInArray(usageSessions.deviceId, phoneIds)));
  const fresh = new Date(Date.parse(now) - KNOWN_FOR_MS).toISOString();
  return {
    knownUntil: knownUntilOf(phones, fresh),
    uses: [...phoneRows, ...otherRows].toSorted(byStartThenDevice),
  };
};

/** App sessions on every device overlapping a range, by start. */
export const listUsage = async (db: Db, { from, to }: Range): Promise<readonly UsageRow[]> => {
  const { usageSessions } = schema;
  return await db
    .select({
      app: usageSessions.app,
      deviceId: usageSessions.deviceId,
      deviceName: usageSessions.deviceName,
      endAt: usageSessions.endAt,
      startAt: usageSessions.startAt,
    })
    .from(usageSessions)
    .where(and(lt(usageSessions.startAt, to), gt(usageSessions.endAt, from)))
    .orderBy(usageSessions.startAt);
};

/**
Each device that sent usage and the end of its newest session: when the person's sessions list
says an app or an agent last sent data.
*/
export const usageDevices = async (
  db: Db,
): Promise<readonly { readonly deviceId: string; readonly at: string }[]> => {
  const { usageSessions } = schema;
  const rows = await db
    .select({ at: max(usageSessions.endAt), deviceId: usageSessions.deviceId })
    .from(usageSessions)
    .groupBy(usageSessions.deviceId);
  return rows.filter((row): row is { at: string; deviceId: string } => row.at !== null);
};
