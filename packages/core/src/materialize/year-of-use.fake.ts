import type { Event, EventInput } from "../events/event-schema.ts";

import { ACTIVITY_CATEGORIES } from "../events/payloads.ts";
import { createIdFactory, type Prng } from "../ids.ts";

/** A small seeded generator (mulberry32): the same seed makes the same log on every run. */
const seededPrng = (seed: number): Prng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const START_MS = Date.parse("2025-11-01T06:00:00.000Z");
const YEAR_MS = 365 * 86_400_000;
const LABELS = ["Deep work", "Calculus", "Lunch", "Metro", "Gym", "Reading", "Call", "Shower"];

const iso = (ms: number): string => new Date(ms).toISOString();

type Body = Partial<Pick<EventInput, "source">> & Pick<EventInput, "payload" | "type">;

/** One weighted step of the owner's day; it answers the event bodies it adds (none when it cannot). */
type Step = (at: number) => readonly Body[];

/**
A year of the owner's use, `count` events long and the same for one `seed`: live activities
(started, stopped, relabelled, adjusted, alongside ones), blocks logged afterwards and calendar
events attended (system `activity.logged`), tasks with subtasks checked off, closed and reopened,
projects, a series, settings, and corrections (amendments and revocations, a revocation revoked).
The events come in the order they occurred; a logged block covers time before its event.
*/
export const yearOfUse = (count: number, seed = 1): readonly Event[] => {
  const random = seededPrng(seed);
  const newId = createIdFactory(random);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

  const activities: string[] = [];
  const running: string[] = [];
  const tasks: { readonly id: string; readonly subtasks: readonly string[] }[] = [];
  const projects: string[] = [];
  const recent: Event[] = [];
  let made = 0;

  const activityBody = (): { label: string; category: (typeof ACTIVITY_CATEGORIES)[number] } => ({
    category: pick(ACTIVITY_CATEGORIES),
    label: pick(LABELS),
  });

  const start: Step = () => {
    const activityId = `a${made}`;
    const isAlongside = random() < 0.1;
    const taskId = tasks.length > 0 && random() < 0.3 ? pick(tasks).id : undefined;
    activities.push(activityId);
    running.push(activityId);
    return [
      {
        payload: {
          activityId,
          ...activityBody(),
          ...(isAlongside && { alongside: true as const }),
          ...(taskId !== undefined && { taskId }),
        },
        type: "activity.started",
      },
    ];
  };
  const stop: Step = () => {
    const activityId = running.pop();
    return activityId === undefined ? [] : [{ payload: { activityId }, type: "activity.stopped" }];
  };
  const logged: Step = (at) => {
    const activityId = `l${made}`;
    const startMs = at - 3_600_000 - Math.floor(random() * 6 * 3_600_000);
    activities.push(activityId);
    return [
      {
        payload: {
          activityId,
          ...activityBody(),
          endAt: iso(startMs + 1_800_000 + Math.floor(random() * 3_600_000)),
          startAt: iso(startMs),
        },
        // Every fourth block is a calendar event the person attended.
        source: random() < 0.25 ? "system" : "app",
        type: "activity.logged",
      },
    ];
  };
  const labelled: Step = () =>
    activities.length === 0
      ? []
      : [
          {
            payload: { activityId: pick(activities.slice(-20)), label: pick(LABELS) },
            type: "activity.labelled",
          },
        ];
  const adjusted: Step = (at) =>
    activities.length === 0
      ? []
      : [
          {
            payload: { activityId: pick(activities.slice(-20)), startAt: iso(at - 900_000) },
            type: "activity.adjusted",
          },
        ];
  const created: Step = () => {
    const taskId = `t${made}`;
    const subtasks = Array.from({ length: Math.floor(random() * 6) }, (_, index) => ({
      id: `${taskId}s${index}`,
      label: `Problem ${index + 1}`,
      number: index + 1,
    }));
    const projectId = projects.length > 0 && random() < 0.5 ? pick(projects) : undefined;
    tasks.push({ id: taskId, subtasks: subtasks.map((item) => item.id) });
    return [
      {
        payload: {
          fields: {},
          presetId: "inbox",
          subtasks,
          taskId,
          title: `Task ${made}`,
          ...(projectId !== undefined && { projectId }),
        },
        type: "task.created",
      },
    ];
  };
  const checked: Step = () => {
    const task = tasks.length === 0 ? undefined : pick(tasks.slice(-30));
    return task === undefined || task.subtasks.length === 0
      ? []
      : [
          {
            payload: { subtaskId: pick(task.subtasks), taskId: task.id },
            type: "task.subtask.solved",
          },
        ];
  };
  const closed: Step = () =>
    tasks.length === 0
      ? []
      : [{ payload: { outcome: "done", taskId: pick(tasks.slice(-30)).id }, type: "task.closed" }];
  const reopened: Step = () =>
    tasks.length === 0
      ? []
      : [{ payload: { taskId: pick(tasks.slice(-30)).id }, type: "task.reopened" }];
  const status: Step = () =>
    tasks.length === 0
      ? []
      : [
          {
            payload: { status: pick(["in_progress", "paused"] as const), taskId: pick(tasks).id },
            type: "task.status.set",
          },
        ];
  const project: Step = () => {
    const projectId = `p${made}`;
    projects.push(projectId);
    return [{ payload: { name: `Project ${made}`, projectId }, type: "project.created" }];
  };
  const settings: Step = () => [
    { payload: { nightHours: random() < 0.5 }, type: "settings.updated" },
  ];
  const series: Step = (at) => {
    const seriesId = `r${made}`;
    return [
      {
        payload: {
          schedule: { kind: "weekly" },
          seriesId,
          template: {
            fields: {},
            presetId: "inbox",
            seriesId,
            seriesRevision: 0,
            startAt: iso(at),
            startTz: "Europe/Moscow",
            subtasks: [],
            taskId: `${seriesId}-1`,
            title: "Weekly review",
          },
        },
        type: "series.created",
      },
    ];
  };
  const amended: Step = () => {
    const target = recent.length === 0 ? undefined : pick(recent.slice(-50));
    if (target?.type === "activity.started" || target?.type === "activity.logged") {
      return [
        { payload: { patch: { label: pick(LABELS) }, targetId: target.id }, type: "event.amended" },
      ];
    }
    return target?.type === "task.created"
      ? [{ payload: { patch: { title: "Renamed" }, targetId: target.id }, type: "event.amended" }]
      : [];
  };
  const revoked: Step = () => {
    const target = recent.length === 0 ? undefined : pick(recent.slice(-50));
    return target === undefined
      ? []
      : [{ payload: { targetId: target.id }, type: "event.revoked" }];
  };

  // Weights per 1,000 steps: the mix of a year of the owner's use.
  const steps: readonly (readonly [number, Step])[] = [
    [300, start],
    [110, stop],
    [150, logged],
    [40, labelled],
    [30, adjusted],
    [90, created],
    [90, checked],
    [50, closed],
    [10, reopened],
    [30, status],
    [5, project],
    [3, settings],
    [2, series],
    [45, amended],
    [45, revoked],
  ];
  const total = steps.reduce((sum, [weight]) => sum + weight, 0);
  const choose = (): Step => {
    let roll = random() * total;
    for (const [weight, step] of steps) {
      roll -= weight;
      if (roll < 0) {
        return step;
      }
    }
    return start;
  };

  const log: Event[] = [];
  let now = START_MS;
  while (log.length < count) {
    now += Math.floor((random() * 2 * YEAR_MS) / count) + 1;
    const bodies = choose()(now);
    for (const body of bodies) {
      const occurredAt = iso(now);
      const next = {
        deviceId: "phone",
        id: newId(now),
        occurredAt,
        precision: "exact",
        recordedAt: occurredAt,
        source: "app",
        ...body,
      } as Event;
      log.push(next);
      recent.push(next);
      made += 1;
    }
  }
  return log.slice(0, count);
};
