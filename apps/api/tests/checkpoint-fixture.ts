import { addMinutesIso, type Event, parseEvent } from "@pace/core";

const NOW = "2026-11-06T12:00:00.000Z";
const stamped = (
  id: string,
  type: string,
  { payload, occurredAt }: { readonly payload: object; readonly occurredAt: string },
): Event => {
  const parsed = parseEvent({
    id: `auto:history:${id}`,
    type,
    payload,
    occurredAt,
    recordedAt: occurredAt,
    deviceId: "fixture",
    precision: "exact",
    source: "app",
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

/** Fixed synthetic months: closed tasks, activity pairs and an old task still open today. */
export const checkpointHistory = (months: number) => {
  const days = months * 31;
  const start = addMinutesIso(NOW, -days * 1440);
  const events: Event[] = [
    stamped("settings", "settings.updated", {
      payload: { timezone: "UTC", digestWindows: [] },
      occurredAt: start,
    }),
    stamped("open", "task.created", {
      payload: { taskId: "old-open", title: "Open since the first day", presetId: "personal" },
      occurredAt: start,
    }),
  ];
  for (let day = 0; day < days; day += 1) {
    const at = addMinutesIso(start, day * 1440);
    for (let task = 0; task < 8; task += 1) {
      const id = `${String(day)}-${String(task)}`;
      const when = addMinutesIso(at, task * 20);
      events.push(
        stamped(`create-${id}`, "task.created", {
          payload: { taskId: id, title: `Задача 🦊 ${id}`, presetId: "personal" },
          occurredAt: when,
        }),
        stamped(`close-${id}`, "task.closed", {
          payload: { taskId: id, outcome: "done" },
          occurredAt: addMinutesIso(when, 10),
        }),
      );
    }
    for (let activity = 0; activity < 2; activity += 1) {
      const id = `activity-${String(day)}-${String(activity)}`;
      const when = addMinutesIso(at, 200 + activity * 40);
      events.push(
        stamped(`start-${id}`, "activity.started", {
          payload: { activityId: id, label: "Reading", category: "chores" },
          occurredAt: when,
        }),
        stamped(`stop-${id}`, "activity.stopped", {
          payload: { activityId: id },
          occurredAt: addMinutesIso(when, 30),
        }),
      );
    }
  }
  return { events, now: NOW };
};
