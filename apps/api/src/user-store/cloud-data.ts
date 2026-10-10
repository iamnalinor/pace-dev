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
        deviceId,
        endAt: event.endAt,
        eventId: event.id,
        series: event.series,
        startAt: event.startAt,
        title: event.title,
      })
      .onConflictDoNothing();
  }
  return events.length;
};

/** The calendar's events overlapping a range, each occurrence once (phones may both send it). */
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
          (other) => other.eventId === row.eventId && other.startAt === row.startAt,
        ) === index,
    )
    .map((row) => ({
      endAt: row.endAt,
      id: row.eventId,
      series: row.series,
      startAt: row.startAt,
      title: row.title,
    }));
};

export const clearCalendar = async (db: Db): Promise<void> => {
  await db.delete(schema.calendarEvents);
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

/** Each device that sent usage: its id, its latest name and the end of its newest session. */
export const usageDevices = async (
  db: Db,
): Promise<
  readonly { readonly deviceId: string; readonly deviceName: string; readonly at: string }[]
> => {
  const { usageSessions } = schema;
  const rows = await db
    .select({
      at: max(usageSessions.endAt),
      deviceId: usageSessions.deviceId,
      deviceName: max(usageSessions.deviceName),
    })
    .from(usageSessions)
    .groupBy(usageSessions.deviceId);
  return rows.map((row) => ({
    at: row.at ?? "",
    deviceId: row.deviceId,
    deviceName: row.deviceName ?? row.deviceId,
  }));
};
