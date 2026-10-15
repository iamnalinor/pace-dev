import { z } from "zod";

import { knownValue, knownValues } from "../tolerant.ts";

// What a client sends is strict (a key the server does not know is refused); what the server
// answers is not (a client parsing it drops keys a newer server added): adding a field to an
// answer must never break an older client.

/** A stretch of time to read: what overlaps [from, to). */
export const RangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

/** How long the calendar's free-text fields may be: the phone cuts them to these. */
export const CALENDAR_LIMITS = { location: 500, name: 200, notes: 2000, url: 2000 } as const;

/** One occurrence of a calendar event, as a phone read it (own or accepted only). */
const CALENDAR_EVENT = {
  id: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  /** Same for every occurrence of a repeating event; `null` for a one-off. */
  series: z.string().max(300).nullable(),
  // What else the phone's calendar tells, for the event's details; each one only when it is
  // there (older phones send none of them).
  location: z.string().max(CALENDAR_LIMITS.location).optional(),
  /** The description, cut by the phone to the limit. */
  notes: z.string().max(CALENDAR_LIMITS.notes).optional(),
  /** The event's own link (a video call, a page); only http(s) ones are ever opened. */
  url: z.string().max(CALENDAR_LIMITS.url).optional(),
  calendarName: z.string().max(CALENDAR_LIMITS.name).optional(),
  organizer: z.string().max(CALENDAR_LIMITS.name).optional(),
  /** How many people were invited, the person included. */
  attendeeCount: z.number().int().nonnegative().max(100_000).optional(),
};

/** An event as a phone sends it. */
export const CalendarEventSchema = z.strictObject(CALENDAR_EVENT);

export type CalendarEvent = z.output<typeof CalendarEventSchema>;

/** A phone's copy of its calendar over [from, to): it replaces what that phone sent before. */
export const CalendarSyncSchema = z.strictObject({
  deviceId: z.string().min(1).max(64),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  events: z.array(CalendarEventSchema).max(2000),
  /** Series answered "every time" on the phone: the server never announces them as they start. */
  ruledSeries: z.array(z.string().max(300)).max(500).optional(),
});

export const CalendarOutputSchema = z.object({ events: z.array(z.object(CALENDAR_EVENT)) });

/** An app in front on a device: its name and when (never what was in it). */
export const UsageSessionSchema = z.strictObject({
  app: z.string().trim().min(1).max(120),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
});

export const UsageUploadSchema = z.strictObject({
  deviceId: z.string().min(1).max(64),
  deviceName: z.string().trim().min(1).max(80),
  sessions: z.array(UsageSessionSchema).max(1000),
});

export const UsageRowSchema = z.object({
  ...UsageSessionSchema.shape,
  deviceId: z.string(),
  deviceName: z.string(),
});

export type UsageRow = z.output<typeof UsageRowSchema>;

export const UsageOutputSchema = z.object({ sessions: z.array(UsageRowSchema) });

export const StoredSchema = z.object({ stored: z.number().int().nonnegative() });

/**
A device that sends its app usage: a computer connected with its own token (it may only
upload), or a phone signed in to the app. `lastActivityAt` is the end of the newest session
it sent; a computer's `connectedAt` and `lastSeenAt` come from its token.
*/
export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** A kind a newer server added reads as a phone: shown, with nothing to disconnect. */
  kind: knownValue(["computer", "phone"], "phone"),
  connectedAt: z.number().nullable(),
  lastSeenAt: z.number().nullable(),
  lastActivityAt: z.iso.datetime().nullable(),
});

export type Device = z.output<typeof DeviceSchema>;

export const DevicesOutputSchema = z.object({ devices: knownValues(DeviceSchema) });

export const DeviceCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });

/** The new device and its token, shown once. */
export const DeviceCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  token: z.string(),
});

export const DoneSchema = z.object({ ok: z.literal(true) });
