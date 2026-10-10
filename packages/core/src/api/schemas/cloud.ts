import { z } from "zod";

/** A stretch of time to read: what overlaps [from, to). */
export const RangeQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

/** One occurrence of a calendar event, as a phone read it (own or accepted only). */
export const CalendarEventSchema = z.strictObject({
  id: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  /** Same for every occurrence of a repeating event; `null` for a one-off. */
  series: z.string().max(300).nullable(),
});

export type CalendarEvent = z.output<typeof CalendarEventSchema>;

/** A phone's copy of its calendar over [from, to): it replaces what that phone sent before. */
export const CalendarSyncSchema = z.strictObject({
  deviceId: z.string().min(1).max(64),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  events: z.array(CalendarEventSchema).max(2000),
});

export const CalendarOutputSchema = z.strictObject({ events: z.array(CalendarEventSchema) });

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

export const UsageRowSchema = z.strictObject({
  ...UsageSessionSchema.shape,
  deviceId: z.string(),
  deviceName: z.string(),
});

export type UsageRow = z.output<typeof UsageRowSchema>;

export const UsageOutputSchema = z.strictObject({ sessions: z.array(UsageRowSchema) });

export const StoredSchema = z.strictObject({ stored: z.number().int().nonnegative() });

/**
A device that sends its app usage: a computer connected with its own token (it may only
upload), or a phone signed in to the app. `lastActivityAt` is the end of the newest session
it sent; a computer's `connectedAt` and `lastSeenAt` come from its token.
*/
export const DeviceSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["computer", "phone"]),
  connectedAt: z.number().nullable(),
  lastSeenAt: z.number().nullable(),
  lastActivityAt: z.iso.datetime().nullable(),
});

export type Device = z.output<typeof DeviceSchema>;

export const DevicesOutputSchema = z.strictObject({ devices: z.array(DeviceSchema) });

export const DeviceCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });

/** The new device and its token, shown once. */
export const DeviceCreatedSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  token: z.string(),
});

export const DoneSchema = z.strictObject({ ok: z.literal(true) });
