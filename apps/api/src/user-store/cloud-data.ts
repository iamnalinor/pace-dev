import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, eq, gt, lt, max, sql } from "drizzle-orm";

import type { CalendarEvent, UsageRow } from "@pace/core";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** [from, to): the rows of a table that overlap it. */
export type Range = { readonly from: string; readonly to: string };

/** A phone's calendar over a range: its earlier copy of that range goes, the new one comes in. */
export const replaceCalendar = async (
  db: Db,
  {
    deviceId,
    events,
    from,
    to,
  }: Range & {
    readonly deviceId: string;
    readonly events: readonly CalendarEvent[];
  },
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

/** A device's sessions: a session seen again (same app and start) keeps the later end. */
export const addUsage = async (
  db: Db,
  upload: {
    readonly deviceId: string;
    readonly deviceName: string;
    readonly sessions: readonly Omit<UsageRow, "deviceId" | "deviceName">[];
  },
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
  return valid.length;
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
