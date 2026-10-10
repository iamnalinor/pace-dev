import type { EventType } from "../events/event-schema.ts";
import type { MessageKey } from "./i18n.ts";

/**
What History calls each event type. A typed map rather than a built key, so an event type
without a label fails the type check instead of the page.
*/
export const EVENT_LABEL_KEYS: Readonly<Record<EventType, MessageKey>> = {
  "task.created": "event.task.created",
  "task.updated": "event.task.updated",
  "task.preset.set": "event.task.preset.set",
  "task.overrides.set": "event.task.overrides.set",
  "task.status.set": "event.task.status.set",
  "task.subtask.solved": "event.task.subtask.solved",
  "task.subtask.removed": "event.task.subtask.removed",
  "task.subtasks.added": "event.task.subtasks.added",
  "task.submitted": "event.task.submitted",
  "task.closed": "event.task.closed",
  "task.reopened": "event.task.reopened",
  "task.importance.set": "event.task.importance.set",
  "task.project.set": "event.task.project.set",
  "task.progress.set": "event.task.progress.set",
  "task.estimate.set": "event.task.estimate.set",
  "task.rank.set": "event.task.rank.set",
  "task.source.attached": "event.task.source.attached",
  "project.created": "event.project.created",
  "project.updated": "event.project.updated",
  "preset.created": "event.preset.created",
  "preset.updated": "event.preset.updated",
  "preset.archived": "event.preset.archived",
  "settings.updated": "event.settings.updated",
  "focus.started": "event.focus.started",
  "focus.ended": "event.focus.ended",
  "activity.started": "event.activity.started",
  "activity.stopped": "event.activity.stopped",
  "activity.logged": "event.activity.logged",
  "activity.adjusted": "event.activity.adjusted",
  "activity.labelled": "event.activity.labelled",
  "activity.button.set": "event.activity.button.set",
  "activity.button.removed": "event.activity.button.removed",
  "event.amended": "event.event.amended",
  "event.revoked": "event.event.revoked",
};
