import { expect } from "@playwright/test";

import { API_URL } from "./login.ts";

/**
A lived-in account for the route sweep: Russian text, projects, open, future and closed tasks,
activities, preset edits and corrections, so that every event type is in the log at least
once (`SEEDED_TYPES`; a new type in core's `EVENT_TYPES` needs a line here). A screen that only breaks on real data (a missing translation, an unexpected shape)
breaks here, not on the person's phone.
*/

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ZONE = "Europe/Moscow";

/** A ULID whose time part is `at`, so the seeded ids sort like real ones. */
const ulid = (at: number): string => {
  const time = Array.from({ length: 10 }, (_, index) =>
    CROCKFORD.charAt(Math.floor(at / 32 ** (9 - index)) % 32),
  ).join("");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    CROCKFORD.charAt(byte % 32),
  ).join("");
  return `${time}${random}`;
};

/** Every event type core knows (core's `EVENT_TYPES`), each seeded at least once below. */
const SEEDED_TYPES = [
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
  "activity.started",
  "activity.stopped",
  "activity.logged",
  "activity.adjusted",
  "activity.labelled",
  "activity.button.set",
  "activity.button.removed",
  "event.amended",
  "event.revoked",
] as const;

type Seeded = {
  readonly type: (typeof SEEDED_TYPES)[number];
  readonly at: number;
  readonly payload: Record<string, unknown>;
  /** Fixed id, for an event a correction points at. */
  readonly id?: string;
};

export type LivedIn = {
  readonly algebraId: string;
  readonly openTaskId: string;
  readonly doneTaskId: string;
};

const iso = (at: number): string => new Date(at).toISOString();

/** The log, oldest first. `now` is the moment the sweep runs. */
const events = (now: number, ids: LivedIn & { readonly workId: string }): readonly Seeded[] => {
  const { algebraId, doneTaskId, openTaskId, workId } = ids;
  const report = ulid(now - 3 * DAY + 1);
  const future = ulid(now - 3 * DAY + 2);
  const reopened = ulid(now - 3 * DAY + 3);
  const amended = ulid(now - 3 * DAY + 4);
  const importance = ulid(now - 3 * DAY + 5);
  const focusActivity = ulid(now - 2 * DAY);
  const typed = ulid(now - 2 * DAY + 1);
  const t0 = now - 4 * DAY;
  return [
    { at: t0, payload: { language: "ru", timezone: ZONE }, type: "settings.updated" },
    {
      at: t0 + 1,
      payload: { color: "pink", name: "Алгебра", projectId: algebraId },
      type: "project.created",
    },
    {
      at: t0 + 2,
      payload: { color: "violet", name: "Работа", projectId: workId },
      type: "project.created",
    },
    {
      at: t0 + 3,
      payload: { description: "Курс Проскурякова", projectId: algebraId },
      type: "project.updated",
    },
    {
      at: t0 + 4,
      payload: {
        definition: { defaultEstimateMinutes: 90 },
        extends: "hw",
        id: "hw.seeded",
        name: "Матан",
      },
      type: "preset.created",
    },
    { at: t0 + 5, payload: { id: "hw.seeded", name: "Матанализ" }, type: "preset.updated" },
    {
      at: t0 + 6,
      payload: { definition: {}, extends: "personal", id: "personal.old", name: "Старое" },
      type: "preset.created",
    },
    { at: t0 + 7, payload: { id: "personal.old" }, type: "preset.archived" },
    {
      at: t0 + 10,
      payload: {
        description: "Решить методом выделения линейных множителей",
        dueAt: iso(now + 3 * DAY),
        dueTz: ZONE,
        fields: { link: "https://example.com/algebra" },
        presetId: "hw",
        projectId: algebraId,
        sourceText:
          "№№ 290, 292, 293 — решить методом выделения линейных множителей (в 292 можно воспользоваться решением похожей задачи, разобранной в Проскурякове, пример 3, стр. 31).",
        subtasks: [
          { id: "s290", label: "290", number: 290 },
          { id: "s292", label: "292", number: 292 },
        ],
        taskId: openTaskId,
        title: "ДЗ по алгебре: №№ 290, 292",
      },
      type: "task.created",
    },
    {
      at: t0 + 11,
      payload: { subtaskId: "s290", taskId: openTaskId },
      type: "task.subtask.solved",
    },
    {
      at: t0 + 12,
      payload: { subtasks: [{ id: "s293", label: "293", number: 293 }], taskId: openTaskId },
      type: "task.subtasks.added",
    },
    {
      at: t0 + 13,
      payload: { sourceText: "Дополнение: № 365 (вычислить определитель)", taskId: openTaskId },
      type: "task.source.attached",
    },
    {
      at: t0 + 14,
      payload: {
        dueAt: iso(now + DAY),
        dueTz: ZONE,
        presetId: "work",
        taskId: report,
        title: "Подготовить отчёт",
      },
      type: "task.created",
    },
    { at: t0 + 15, payload: { progress: 4, taskId: report }, type: "task.progress.set" },
    { at: t0 + 16, payload: { estimateMinutes: 180, taskId: report }, type: "task.estimate.set" },
    {
      at: t0 + 17,
      id: importance,
      payload: { importance: "prioritized", taskId: report },
      type: "task.importance.set",
    },
    { at: t0 + 18, payload: { projectId: workId, taskId: report }, type: "task.project.set" },
    { at: t0 + 19, payload: { presetId: "work", taskId: report }, type: "task.preset.set" },
    {
      at: t0 + 20,
      payload: { overrides: { defaultEstimateMinutes: 120 }, taskId: report },
      type: "task.overrides.set",
    },
    // Removed in stage 6, still in old logs: they must read without breaking anything.
    { at: t0 + 21, payload: { status: "waiting", taskId: report }, type: "task.status.set" },
    { at: t0 + 22, payload: { rank: 1, taskId: report }, type: "task.rank.set" },
    {
      at: t0 + 23,
      payload: { title: "Подготовить квартальный отчёт", taskId: report },
      type: "task.updated",
    },
    {
      at: t0 + 24,
      payload: {
        presetId: "deferred",
        startAt: iso(now + 5 * DAY),
        startTz: ZONE,
        taskId: future,
        title: "Записаться к стоматологу",
      },
      type: "task.created",
    },
    {
      at: t0 + 25,
      payload: {
        dueAt: iso(now - 2 * DAY),
        dueTz: ZONE,
        presetId: "hw",
        projectId: algebraId,
        taskId: doneTaskId,
        title: "hw Algebra 123 124",
      },
      type: "task.created",
    },
    { at: t0 + 26, payload: { closes: true, taskId: doneTaskId }, type: "task.submitted" },
    {
      at: t0 + 27,
      id: amended,
      payload: { presetId: "personal", taskId: reopened, title: "Купить продукты" },
      type: "task.created",
    },
    { at: t0 + 28, payload: { outcome: "done", taskId: reopened }, type: "task.closed" },
    { at: t0 + 29, payload: { taskId: reopened }, type: "task.reopened" },
    {
      at: t0 + 30,
      payload: { patch: { title: "Купить продукты на неделю" }, targetId: amended },
      type: "event.amended",
    },
    { at: t0 + 31, payload: { targetId: importance }, type: "event.revoked" },
    { at: now - 2 * DAY - HOUR, payload: { taskId: openTaskId }, type: "focus.started" },
    { at: now - 2 * DAY - 30 * MINUTE, payload: { taskId: openTaskId }, type: "focus.ended" },
    {
      at: now - 2 * DAY,
      payload: {
        activityId: focusActivity,
        category: "task",
        label: "ДЗ по алгебре",
        taskId: openTaskId,
      },
      type: "activity.started",
    },
    {
      at: now - 2 * DAY + 50 * MINUTE,
      payload: { activityId: focusActivity },
      type: "activity.stopped",
    },
    {
      at: now - 2 * DAY + 51 * MINUTE,
      payload: { activityId: focusActivity, startAt: iso(now - 2 * DAY + 5 * MINUTE) },
      type: "activity.adjusted",
    },
    {
      at: now - 2 * DAY + 52 * MINUTE,
      payload: { activityId: focusActivity, label: "Алгебра, №290" },
      type: "activity.labelled",
    },
    {
      at: now - DAY,
      payload: {
        activityId: ulid(now - DAY),
        category: "commute",
        endAt: iso(now - DAY + 40 * MINUTE),
        label: "Дорога в вуз",
        startAt: iso(now - DAY),
      },
      type: "activity.logged",
    },
    {
      // An older event's shape: a limit, as the bar once set it (read, never used).
      at: now - 3 * HOUR,
      payload: {
        activityId: ulid(now - 3 * HOUR),
        category: "hygiene",
        label: "Собираюсь",
        limitMinutes: 60,
      },
      type: "activity.started",
    },
    {
      at: now - 2 * HOUR,
      payload: { activityId: typed, category: "other", expectMinutes: 20, label: "Пошёл в ЦСС" },
      type: "activity.started",
    },
    {
      at: now - 90 * MINUTE,
      payload: {
        activityId: ulid(now - 90 * MINUTE),
        alongside: true,
        category: "rest",
        label: "Музыка",
      },
      type: "activity.started",
    },
    {
      at: now - 3 * DAY,
      payload: {
        buttonId: "btn:seeded",
        category: "rest",
        color: "green",
        label: "Отдых",
        order: 9,
      },
      type: "activity.button.set",
    },
    { at: now - 3 * DAY + 1, payload: { buttonId: "btn:seeded" }, type: "activity.button.removed" },
  ];
};

/** Pushes the lived-in log for the account behind `token`; every event must be accepted. */
export const seedLivedIn = async (token: string): Promise<LivedIn> => {
  const now = Date.now();
  const ids = {
    algebraId: ulid(now - 5 * DAY),
    doneTaskId: ulid(now - 5 * DAY + 1),
    openTaskId: ulid(now - 5 * DAY + 2),
    workId: ulid(now - 5 * DAY + 3),
  };
  const log = events(now, ids);
  expect(new Set(log.map((event) => event.type))).toEqual(new Set(SEEDED_TYPES));
  const envelopes = log.map((event) => ({
    deviceId: "e2e-seed",
    id: event.id ?? ulid(event.at),
    occurredAt: iso(event.at),
    payload: event.payload,
    precision: "exact",
    recordedAt: iso(now),
    source: "web",
    type: event.type,
  }));
  const response = await fetch(`${API_URL}/api/sync/push`, {
    body: JSON.stringify({ events: envelopes }),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.ok).toBe(true);
  const result = (await response.json()) as { rejected: readonly unknown[] };
  expect(result.rejected).toEqual([]);
  return ids;
};
