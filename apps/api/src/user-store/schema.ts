import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The append-only event log: the source of truth for everything the user did. */
export const events = sqliteTable(
  "events",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    id: text().notNull().unique(),
    type: text().notNull(),
    occurredAt: text().notNull(),
    recordedAt: text().notNull(),
    deviceId: text().notNull(),
    precision: text().notNull(),
    source: text().notNull(),
    payload: text().notNull(),
  },
  (table) => [index("events_occurred_idx").on(table.occurredAt)],
);

/** A phone's calendar copy: one row per occurrence, replaced range by range by that phone. */
export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    deviceId: text().notNull(),
    eventId: text().notNull(),
    startAt: text().notNull(),
    endAt: text().notNull(),
    title: text().notNull(),
    series: text(),
    // The event's details, each `null` when the phone did not tell it.
    location: text(),
    notes: text(),
    url: text(),
    calendarName: text(),
    organizer: text(),
    attendeeCount: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.eventId, table.startAt] }),
    index("calendar_events_start_idx").on(table.startAt),
  ],
);

/** Apps in front on each device: names and times only; one row per device, app and start. */
export const usageSessions = sqliteTable(
  "usage_sessions",
  {
    deviceId: text().notNull(),
    deviceName: text().notNull(),
    app: text().notNull(),
    startAt: text().notNull(),
    endAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.app, table.startAt] }),
    index("usage_sessions_start_idx").on(table.startAt),
  ],
);

/** Every automatic decision with its inputs, so "why?" can be answered later. */
export const decisions = sqliteTable(
  "decisions",
  {
    id: text().primaryKey(),
    at: text().notNull(),
    kind: text().notNull(),
    taskId: text(),
    rule: text().notNull(),
    inputs: text().notNull(),
    outcome: text().notNull(),
    explanation: text().notNull(),
  },
  (table) => [index("decisions_task_idx").on(table.taskId), index("decisions_at_idx").on(table.at)],
);

/**
The notification pool: one row per notification, shown by every channel its kind is on for
(Telegram, the app, the web). Telegram's copy is tracked so a resolution elsewhere can delete it.
*/
export const notifications = sqliteTable(
  "notifications",
  {
    /** A ULID: ids sort by creation. */
    id: text().primaryKey(),
    kind: text().notNull(),
    /** What it is about (`refOf`): an event's key, an activity's ask, a slot, a session. */
    ref: text().notNull(),
    createdAt: text().notNull(),
    /** The kind's payload as JSON (zod schema per kind in core). */
    payload: text().notNull(),
    readAt: text(),
    resolvedAt: text(),
    resolution: text(),
    /** `pending` | `sent` | `skipped` (channel off or no chat) | `failed`. */
    telegramState: text().notNull(),
    telegramChatId: text(),
    telegramMessageId: integer(),
    telegramSentAt: text(),
  },
  (table) => [
    index("notifications_ref_idx").on(table.kind, table.ref),
    index("notifications_open_idx").on(table.resolvedAt),
  ],
);

/**
The delivery log: every push attempt of a notification to a device (its session), by the
device's push method, with the result. A device that got one (`sent`) is never sent it again,
and a resolution takes back every copy sent; the feed shows it for debugging.
*/
export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    notificationId: text().notNull(),
    sessionId: text().notNull(),
    /** The device as its session is named ("android", later the phone's name). */
    device: text().notNull(),
    /** The push method (`fcm`, `poll`). */
    method: text().notNull(),
    /** Where it went (the FCM token; the session for polling). */
    endpoint: text().notNull(),
    attemptedAt: text().notNull(),
    /** `sent` | `failed`. */
    result: text().notNull(),
    /** Why it failed (`gone`, `auth`, `failed`). */
    reason: text(),
    /** When the copy was taken back from the device. */
    dismissedAt: text(),
  },
  (table) => [index("notification_deliveries_idx").on(table.notificationId, table.sessionId)],
);

/**
What waits for a device whose push method is `poll`: notifications to show and ones to take
back, fetched by its periodic background check (and by the open app). Fetched entries are
acknowledged by the next fetch's cursor and dropped.
*/
export const pollOutbox = sqliteTable(
  "poll_outbox",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    sessionId: text().notNull(),
    /** `show` | `dismiss`. */
    type: text().notNull(),
    notificationId: text().notNull(),
    /** For `show`: the text in the account language. */
    title: text(),
    body: text(),
    createdAt: text().notNull(),
  },
  (table) => [index("poll_outbox_session_idx").on(table.sessionId, table.seq)],
);

/** Small key/value state of the store (last digest time, budgets, cursors). */
export const meta = sqliteTable("meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});

/**
Projections of the materialized state for SQL readers (stage 3 analytics, debugging).
Rewritten by the store after every append; never the source of truth.
*/
export const tasks = sqliteTable(
  "tasks",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    presetId: text().notNull(),
    projectId: text(),
    /** The effective importance: the task's own, else the preset default. */
    importance: text().notNull(),
    status: text().notNull(),
    dueAt: text(),
    dueTz: text(),
    startAt: text(),
    createdAt: text().notNull(),
    closedAt: text(),
    /** Derived outcome (`done_late` included); null while open. */
    outcome: text(),
    /** 0..1 in the preset's progress mode. */
    progress: real().notNull(),
    estimateMinutes: integer(),
    touched: integer({ mode: "boolean" }).notNull(),
    /** The task's `lastEventAt`. */
    updatedAt: text().notNull(),
  },
  (table) => [
    index("tasks_project_idx").on(table.projectId),
    index("tasks_status_idx").on(table.status),
    index("tasks_due_idx").on(table.dueAt),
  ],
);

export const subtasks = sqliteTable(
  "subtasks",
  {
    id: text().notNull(),
    taskId: text().notNull(),
    number: integer(),
    label: text().notNull(),
    solvedAt: text(),
    submittedAt: text(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.id] })],
);

export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  color: text(),
  archived: integer({ mode: "boolean" }).notNull(),
  createdAt: text().notNull(),
});

export const presets = sqliteTable("presets", {
  id: text().primaryKey(),
  name: text().notNull(),
  extends: text(),
  builtIn: integer({ mode: "boolean" }).notNull(),
  archived: integer({ mode: "boolean" }).notNull(),
  /** The preset's own definition (what it changes relative to its parent), as JSON. */
  definition: text().notNull(),
});
