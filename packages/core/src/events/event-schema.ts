import { z } from "zod";

import { isUlid } from "../ids.ts";
import { err, ok, type Result } from "../result.ts";
import {
  EventAmendedPayload,
  EventRevokedPayload,
  FocusEndedPayload,
  FocusStartedPayload,
  InstantSchema,
  PresetArchivedPayload,
  PresetCreatedPayload,
  PresetUpdatedPayload,
  ProjectCreatedPayload,
  ProjectUpdatedPayload,
  SettingsUpdatedPayload,
  TaskClosedPayload,
  TaskCreatedPayload,
  TaskEstimateSetPayload,
  TaskImportanceSetPayload,
  TaskOverridesSetPayload,
  TaskPresetSetPayload,
  TaskProgressSetPayload,
  TaskProjectSetPayload,
  TaskRankSetPayload,
  TaskReopenedPayload,
  TaskSourceAttachedPayload,
  TaskStatusSetPayload,
  TaskSubmittedPayload,
  TaskSubtasksAddedPayload,
  TaskSubtaskSolvedPayload,
  TaskUpdatedPayload,
} from "./payloads.ts";

export const EVENT_TYPES = [
  "task.created",
  "task.updated",
  "task.preset.set",
  "task.overrides.set",
  "task.status.set",
  "task.subtask.solved",
  "task.subtasks.added",
  "task.submitted",
  "task.closed",
  "task.reopened",
  "task.importance.set",
  "task.project.set",
  "task.progress.set",
  "task.estimate.set",
  "task.rank.set",
  "task.source.attached",
  "project.created",
  "project.updated",
  "preset.created",
  "preset.updated",
  "preset.archived",
  "settings.updated",
  "focus.started",
  "focus.ended",
  "event.amended",
  "event.revoked",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Deterministic ids for system events (`hw:<presetId>:<isoWeek>`, `auto:<taskId>:<kind>`). */
// An auto outcome of a recurring instance nests ids ("auto:hw:<preset>:<week>:missed"), so
// anything non-blank after the prefix is accepted; the reducers own the exact shape.
const SYSTEM_ID = /^(?:hw|auto):\S+$/;

export const EventIdSchema = z.string().refine((value) => isUlid(value) || SYSTEM_ID.test(value), {
  message: "Expected a ULID or a deterministic system id",
});

export const PrecisionSchema = z.enum(["exact", "approx"]);
export const SourceSchema = z.enum(["app", "web", "bot", "mcp", "system"]);

const Envelope = z.object({
  id: EventIdSchema,
  occurredAt: InstantSchema,
  recordedAt: InstantSchema,
  deviceId: z.string().min(1),
  precision: PrecisionSchema,
  source: SourceSchema,
});

const event = <T extends EventType, P extends z.ZodType>(type: T, payload: P) =>
  Envelope.extend({ type: z.literal(type), payload });

export const EventSchema = z.discriminatedUnion("type", [
  event("task.created", TaskCreatedPayload),
  event("task.updated", TaskUpdatedPayload),
  event("task.preset.set", TaskPresetSetPayload),
  event("task.overrides.set", TaskOverridesSetPayload),
  event("task.status.set", TaskStatusSetPayload),
  event("task.subtask.solved", TaskSubtaskSolvedPayload),
  event("task.subtasks.added", TaskSubtasksAddedPayload),
  event("task.submitted", TaskSubmittedPayload),
  event("task.closed", TaskClosedPayload),
  event("task.reopened", TaskReopenedPayload),
  event("task.importance.set", TaskImportanceSetPayload),
  event("task.project.set", TaskProjectSetPayload),
  event("task.progress.set", TaskProgressSetPayload),
  event("task.estimate.set", TaskEstimateSetPayload),
  event("task.rank.set", TaskRankSetPayload),
  event("task.source.attached", TaskSourceAttachedPayload),
  event("project.created", ProjectCreatedPayload),
  event("project.updated", ProjectUpdatedPayload),
  event("preset.created", PresetCreatedPayload),
  event("preset.updated", PresetUpdatedPayload),
  event("preset.archived", PresetArchivedPayload),
  event("settings.updated", SettingsUpdatedPayload),
  event("focus.started", FocusStartedPayload),
  event("focus.ended", FocusEndedPayload),
  event("event.amended", EventAmendedPayload),
  event("event.revoked", EventRevokedPayload),
]);

export type Event = z.output<typeof EventSchema>;

export type EventOf<T extends EventType> = Extract<Event, { readonly type: T }>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What a caller dispatches: the store assigns `id`, `recordedAt` and `deviceId`. */
export type EventInput = DistributiveOmit<Event, "deviceId" | "id" | "recordedAt"> & {
  readonly deviceId?: string;
  readonly id?: string;
  readonly recordedAt?: string;
};

export const parseEvent = (value: unknown): Result<Event, string> => {
  const parsed = EventSchema.safeParse(value);
  if (parsed.success) {
    return ok(parsed.data);
  }
  const message = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`)
    .join("; ");
  return err(message);
};
