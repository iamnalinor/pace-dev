import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { and, eq, gt, max, notInArray, type Query, type SQL, sql } from "drizzle-orm";

import type { CalendarEvent, DeviceUse, Interval, UsageRow } from "@pace/core";

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

/**
The rows of a table overlapping a range, read through the index on their end: those that end after
`from`, the history before it left unread. (`+` keeps SQLite off the start's index, which would
read every row that starts before `to`, back to the first.)
*/
const overlapping = (
  columns: { readonly startAt: SQLiteColumn; readonly endAt: SQLiteColumn },
  { from, to }: Range,
): SQL | undefined => and(sql`+${columns.startAt} < ${to}`, gt(columns.endAt, from));

/**
One phone's calendar rows overlapping a range, read through the end index too (`+` keeps SQLite off
the primary key, which would read every row the phone ever sent).
*/
const calendarCopyOf = (deviceId: string, range: Range): SQL | undefined =>
  and(
    sql`+${schema.calendarEvents.deviceId} = ${deviceId}`,
    overlapping(schema.calendarEvents, range),
  );

type CalendarRow = typeof schema.calendarEvents.$inferSelect;

const calendarRowOf = (deviceId: string, event: CalendarEvent): CalendarRow => ({
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
});

/** A row's primary key (the device is the copy's own). */
const calendarKeyOf = (row: CalendarRow): string => JSON.stringify([row.eventId, row.startAt]);

/** Every column, in one order: equal text, equal row. */
const calendarTextOf = (row: CalendarRow): string =>
  JSON.stringify([
    row.eventId,
    row.startAt,
    row.endAt,
    row.title,
    row.series,
    row.location,
    row.notes,
    row.url,
    row.calendarName,
    row.organizer,
    row.attendeeCount,
  ]);

/**
A phone's calendar over a range: its earlier copy of that range goes, the new one comes in. The
phone sends its copy with every background run (every 15 minutes or so), mostly unchanged, so only
the rows that differ are deleted and written. Answers how many events came and whether any row
changed.
*/
export const replaceCalendar = async (
  db: Db,
  { deviceId, events, from, to }: CalendarUpload,
): Promise<{ readonly stored: number; readonly isChanged: boolean }> => {
  const { calendarEvents } = schema;
  const fresh = new Map<string, CalendarRow>();
  for (const event of events) {
    const row = calendarRowOf(deviceId, event);
    if (!fresh.has(calendarKeyOf(row))) {
      fresh.set(calendarKeyOf(row), row);
    }
  }
  const kept = await db.select().from(calendarEvents).where(calendarCopyOf(deviceId, { from, to }));
  const old = new Map(kept.map((row) => [calendarKeyOf(row), calendarTextOf(row)]));
  const gone = kept.filter((row) => {
    const now = fresh.get(calendarKeyOf(row));
    return now === undefined || calendarTextOf(now) !== calendarTextOf(row);
  });
  const added = fresh
    .values()
    .filter((row) => old.get(calendarKeyOf(row)) !== calendarTextOf(row))
    .toArray();
  for (const row of gone) {
    await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.deviceId, deviceId),
          eq(calendarEvents.eventId, row.eventId),
          eq(calendarEvents.startAt, row.startAt),
        ),
      );
  }
  for (const row of added) {
    await db.insert(calendarEvents).values(row).onConflictDoNothing();
  }
  return { isChanged: gone.length > 0 || added.length > 0, stored: events.length };
};

/**
The calendar's rows overlapping a range (unordered: ordering in SQL would send SQLite back to the
start's index).
*/
const calendarRange = (db: Db, range: Range) =>
  db.select().from(schema.calendarEvents).where(overlapping(schema.calendarEvents, range));

const byStart = <T extends { readonly startAt: string }>(a: T, b: T): number =>
  a.startAt.localeCompare(b.startAt);

/**
The calendar's events overlapping a range, each occurrence once: two phones send the same event
under their own local ids, so the same title and times count as one.
*/
export const listCalendar = async (db: Db, range: Range): Promise<readonly CalendarEvent[]> => {
  const found = await calendarRange(db, range);
  const rows = found.toSorted(byStart);
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
The two reads automatic sleep makes from `from` on, each through an index on its end so a pass reads
only the rows inside its window, never the whole table: the phones' uses, and the other devices'
app sessions (not a phone's own: an alarm over the lock screen is one).
*/
const sleepUses = (
  db: Db,
  { from, phoneIds }: { readonly from: string; readonly phoneIds: string[] },
) => {
  const { phoneUses, usageSessions } = schema;
  return {
    others: db
      .select({
        deviceId: usageSessions.deviceId,
        endAt: usageSessions.endAt,
        startAt: usageSessions.startAt,
      })
      .from(usageSessions)
      .where(and(gt(usageSessions.endAt, from), notInArray(usageSessions.deviceId, phoneIds))),
    phones: db
      .select({ deviceId: phoneUses.deviceId, endAt: phoneUses.endAt, startAt: phoneUses.startAt })
      .from(phoneUses)
      .where(gt(phoneUses.endAt, from)),
  };
};

/**
What automatic sleep reads from `from` on: the phones' uses and the other devices' app sessions
(see `sleepUses`), by start; and how far that is known, the earliest `until` among the phones
that uploaded within a day (`null` when none did: nothing can be decided). A computer bounds
nothing: switched off at night it stops sending.
*/
export const usageForSleep = async (
  { db, storage }: { readonly db: Db; readonly storage: DurableObjectStorage },
  { from, now }: { readonly from: string; readonly now: string },
): Promise<SleepUsage> => {
  const known = [...(await storage.list<KnownUsage>({ prefix: KNOWN_PREFIX }))];
  const phones = known
    .filter(([, record]) => record.isPhone)
    .map(([key, record]) => ({ deviceId: key.slice(KNOWN_PREFIX.length), ...record }));
  const queries = sleepUses(db, { from, phoneIds: phones.map((phone) => phone.deviceId) });
  const phoneRows = await queries.phones;
  const otherRows = await queries.others;
  const fresh = new Date(Date.parse(now) - KNOWN_FOR_MS).toISOString();
  return {
    knownUntil: knownUntilOf(phones, fresh),
    uses: [...phoneRows, ...otherRows].toSorted(byStartThenDevice),
  };
};

/** App sessions on every device overlapping a range (unordered, as the calendar's). */
const usageRange = (db: Db, range: Range) => {
  const { usageSessions } = schema;
  return db
    .select({
      app: usageSessions.app,
      deviceId: usageSessions.deviceId,
      deviceName: usageSessions.deviceName,
      endAt: usageSessions.endAt,
      startAt: usageSessions.startAt,
    })
    .from(usageSessions)
    .where(overlapping(usageSessions, range));
};

/** App sessions on every device overlapping a range, by start. */
export const listUsage = async (db: Db, range: Range): Promise<readonly UsageRow[]> => {
  const found = await usageRange(db, range);
  return found.toSorted(byStart);
};

/**
The statements behind the reads of a range, as SQLite gets them: what the cost test plans and
counts the rows of.
*/
export const rangeStatements = (
  db: Db,
  { from, phoneIds, range }: { from: string; phoneIds: string[]; range: Range },
): Readonly<Record<"calendar" | "otherUses" | "phoneUses" | "usage", Query>> => {
  const uses = sleepUses(db, { from, phoneIds });
  return {
    calendar: calendarRange(db, range).toSQL(),
    otherUses: uses.others.toSQL(),
    phoneUses: uses.phones.toSQL(),
    usage: usageRange(db, range).toSQL(),
  };
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
