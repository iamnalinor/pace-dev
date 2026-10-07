import type { Event } from "../events/event-schema.ts";
import type { QueryContext } from "./context.ts";

import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materializeAt } from "../materialize/materializer.ts";
import {
  algebraHw6Events,
  at,
  event,
  HW_ID,
  solved,
  submitted,
  trk231Events,
  TRK_ID,
} from "../materialize/task-fixture.fake.ts";
import { exampleCoursePresetEvents } from "../presets/example-presets.ts";
import { addMinutesIso } from "../time.ts";

/**
The world of the artboards on Tuesday, October 6 2026, 15:00 Moscow time. Every number the
Now, Project, Inbox and Task screens show is derived from these events; `TRK_NOW` in the
urgency fixture (Thursday 05:15 UTC) is the instant of the "Why it's 2nd" card.
*/
export const NOW = "2026-10-06T12:00:00.000Z";
/** Wednesday 12:50 Moscow time: 82 % of the HW 6 window (issued Monday 10:00, due 23:59) is gone. */
export const HW_VIEW_NOW = "2026-10-07T09:50:00.000Z";
export const MOSCOW = "Europe/Moscow";
const SEEDED_AT = "2026-09-01T09:00:00.000Z";

export const ALGEBRA_ID = "p-algebra";
export const CALCULUS_ID = "p-calculus";
export const WORK_ID = "p-work";

export const REPLY_ID = "t-reply";
export const BOOKS_ID = "t-books";
export const GRADE_ID = "t-grade";
export const DEMO_ID = "t-demo";
export const RFC_ID = "t-rfc";
export const CALC_HW5_ID = "hw:hw.calculus:2026-W40";
export const CALC_HW5_DUE = "2026-10-05T20:59:00.000Z";
export const CALC_W41_ID = "hw:hw.calculus:2026-W41";
export const HISTORY_W40_ID = "hw:hw.history:2026-W40";
export const INBOX_GRADE_ID = "t-inbox-grade";
export const INBOX_SYNC_ID = "t-inbox-sync";
export const INBOX_CABLE_ID = "t-inbox-cable";
export const DEFERRED_IDS = ["t-passport", "t-dentist", "t-trip"] as const;
/** The six tasks Now folds into "+ 6 later": future starts and empty instances. */
export const LATER_IDS = [GRADE_ID, CALC_W41_ID, HISTORY_W40_ID, ...DEFERRED_IDS] as const;
export const WAITING_IDS = [DEMO_ID, RFC_ID] as const;
export const INBOX_IDS = [INBOX_GRADE_ID, INBOX_SYNC_ID, INBOX_CABLE_ID] as const;
export const INBOX_TEXTS = {
  [INBOX_GRADE_ID]: "посмотреть оценку за кр",
  [INBOX_SYNC_ID]: "синк по дашборду метрик, до пятницы",
  [INBOX_CABLE_ID]: "кабель usb-c",
} as const;

/** The Algebra project's history: eleven closed sheets, two of them closed after their due date. */
export const DONE_SHEETS = 11;
export const LATE_SHEETS: readonly number[] = [3, 10];
export const sheetId = (k: number): string => `t-sheet-${k}`;

const DAY = 24 * 60;

const setup = (): readonly Event[] => [
  at(20, SEEDED_AT, {
    type: "settings.updated",
    payload: { timezone: MOSCOW },
    source: "web",
  }),
  ...exampleCoursePresetEvents(SEEDED_AT).map((input, index) => event(21 + index, input)),
  at(24, SEEDED_AT, {
    type: "project.created",
    payload: { projectId: ALGEBRA_ID, name: "Algebra", color: "blue" },
  }),
  at(25, SEEDED_AT, {
    type: "project.created",
    payload: { projectId: CALCULUS_ID, name: "Calculus", color: "teal" },
  }),
  at(26, SEEDED_AT, {
    type: "project.created",
    payload: { projectId: WORK_ID, name: "Work", color: "violet" },
  }),
];

/** Algebra HW 6: the artboard card plus the 4 h estimate and the project of the task screen. */
const algebraHw6 = (): readonly Event[] => [
  ...algebraHw6Events(),
  at(27, "2026-10-05T07:05:00.000Z", {
    type: "task.estimate.set",
    payload: { taskId: HW_ID, estimateMinutes: 240 },
  }),
  at(28, "2026-10-05T07:05:00.000Z", {
    type: "task.project.set",
    payload: { taskId: HW_ID, projectId: ALGEBRA_ID },
  }),
];

/**
TRK-231 plus its project and rank. The Wednesday re-prioritization restarts the 3-day
horizon so that on Thursday the explicit Friday deadline is the effective one; it is only
part of the state when materialized at or after that instant.
*/
const trk231 = (): readonly Event[] => [
  ...trk231Events(),
  at(30, "2026-10-05T09:01:00.000Z", {
    type: "task.project.set",
    payload: { taskId: TRK_ID, projectId: WORK_ID },
  }),
  at(31, "2026-10-05T09:02:00.000Z", {
    type: "task.rank.set",
    payload: { taskId: TRK_ID, rank: 2 },
  }),
  at(32, "2026-10-07T12:00:00.000Z", {
    type: "task.importance.set",
    payload: { taskId: TRK_ID, importance: "prioritized" },
  }),
];

/** The two other Prioritized work tasks, both waiting: TRK-231 is "2 of 3". */
const waitingWork = (): readonly Event[] => [
  at(33, "2026-10-05T10:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: DEMO_ID,
      title: "Prepare demo for Friday",
      presetId: "work",
      projectId: WORK_ID,
      importance: "prioritized",
      dueAt: "2026-10-09T15:00:00.000Z",
      dueTz: "UTC",
      subtasks: [],
      fields: {},
    },
  }),
  at(34, "2026-10-05T10:01:00.000Z", {
    type: "task.rank.set",
    payload: { taskId: DEMO_ID, rank: 1 },
  }),
  at(35, "2026-10-06T08:30:00.000Z", {
    type: "task.progress.set",
    payload: { taskId: DEMO_ID, progress: 3 },
  }),
  at(36, "2026-10-06T09:00:00.000Z", {
    type: "task.status.set",
    payload: { taskId: DEMO_ID, status: "waiting" },
  }),
  at(37, "2026-10-05T11:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: RFC_ID,
      title: "RFC: dedicated runner pool",
      presetId: "work",
      projectId: WORK_ID,
      importance: "prioritized",
      subtasks: [],
      fields: {},
    },
  }),
  at(38, "2026-10-05T11:01:00.000Z", {
    type: "task.rank.set",
    payload: { taskId: RFC_ID, rank: 3 },
  }),
  at(39, "2026-10-05T15:00:00.000Z", {
    type: "task.status.set",
    payload: { taskId: RFC_ID, status: "waiting" },
  }),
];

type InstanceSpec = {
  readonly id: string;
  readonly title: string;
  readonly presetId: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly subtasks: readonly {
    readonly id: string;
    readonly label: string;
    readonly number: number;
  }[];
};

const instance = (spec: InstanceSpec): Event =>
  at(0, spec.issuedAt, {
    id: spec.id,
    type: "task.created",
    source: "system",
    payload: {
      taskId: spec.id,
      title: spec.title,
      presetId: spec.presetId,
      startAt: spec.issuedAt,
      startTz: MOSCOW,
      dueAt: spec.dueAt,
      dueTz: MOSCOW,
      estimateMinutes: 60,
      subtasks: [...spec.subtasks],
      fields: {},
    },
  });

const CALC_PROBLEMS = [1, 2, 3, 4, 5].map((number) => ({
  id: `c${number}`,
  label: `Problem ${number}`,
  number,
}));

/** Calculus HW 5: due Monday 23:59 Moscow, 3 of 5 solved and sent, "1 day late · 2 problems left". */
const calculusHw5 = (): readonly Event[] => [
  instance({
    id: CALC_HW5_ID,
    title: "Calculus HW 5",
    presetId: "hw.calculus",
    issuedAt: "2026-09-29T09:00:00.000Z",
    dueAt: CALC_HW5_DUE,
    subtasks: CALC_PROBLEMS,
  }),
  at(40, "2026-09-29T09:05:00.000Z", {
    type: "task.project.set",
    payload: { taskId: CALC_HW5_ID, projectId: CALCULUS_ID },
  }),
  solved(41, "2026-10-02T10:00:00.000Z", { id: "c1", taskId: CALC_HW5_ID }),
  solved(42, "2026-10-02T11:00:00.000Z", { id: "c2", taskId: CALC_HW5_ID }),
  solved(43, "2026-10-03T10:00:00.000Z", { id: "c3", taskId: CALC_HW5_ID }),
  submitted(44, "2026-10-03T11:00:00.000Z", {
    taskId: CALC_HW5_ID,
    subtaskIds: ["c1", "c2", "c3"],
  }),
];

const personal = (): readonly Event[] => [
  at(29, "2026-10-06T08:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: REPLY_ID,
      title: "Reply to course curator",
      presetId: "personal",
      importance: "asap",
      subtasks: [],
      fields: {},
    },
  }),
  at(45, "2026-09-24T12:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: BOOKS_ID,
      title: "Return library books",
      presetId: "personal",
      importance: "nice_to_have",
      subtasks: [],
      fields: {},
    },
  }),
];

type DeferredSpec = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly startAt: string;
  readonly projectId?: string;
};

const deferred = (index: number, when: DeferredSpec): Event =>
  at(index, when.createdAt, {
    type: "task.created",
    payload: {
      taskId: when.id,
      title: when.title,
      presetId: "deferred",
      ...(when.projectId !== undefined && { projectId: when.projectId }),
      startAt: when.startAt,
      startTz: MOSCOW,
      subtasks: [],
      fields: {},
    },
  });

/** Hidden from Now: future starts and the two empty instances awaiting an assignment. */
const later = (): readonly Event[] => [
  deferred(46, {
    id: GRADE_ID,
    title: "Check test 1 grade",
    createdAt: "2026-10-01T10:00:00.000Z",
    startAt: "2026-10-20T06:00:00.000Z",
    projectId: ALGEBRA_ID,
  }),
  instance({
    id: CALC_W41_ID,
    title: "Calculus HW 6",
    presetId: "hw.calculus",
    issuedAt: "2026-10-06T09:00:00.000Z",
    dueAt: "2026-10-12T20:59:00.000Z",
    subtasks: [],
  }),
  at(47, "2026-10-06T09:01:00.000Z", {
    type: "task.project.set",
    payload: { taskId: CALC_W41_ID, projectId: CALCULUS_ID },
  }),
  instance({
    id: HISTORY_W40_ID,
    title: "History HW 1",
    presetId: "hw.history",
    issuedAt: "2026-10-01T06:00:00.000Z",
    dueAt: "2026-10-08T06:00:00.000Z",
    subtasks: [],
  }),
  deferred(48, {
    id: DEFERRED_IDS[0],
    title: "Renew passport",
    createdAt: "2026-10-02T10:00:00.000Z",
    startAt: "2026-11-01T06:00:00.000Z",
  }),
  deferred(49, {
    id: DEFERRED_IDS[1],
    title: "Book dentist",
    createdAt: "2026-10-02T11:00:00.000Z",
    startAt: "2026-10-15T06:00:00.000Z",
  }),
  deferred(50, {
    id: DEFERRED_IDS[2],
    title: "Plan winter trip",
    createdAt: "2026-10-03T10:00:00.000Z",
    startAt: "2026-12-01T06:00:00.000Z",
  }),
];

const captured = (index: number, id: keyof typeof INBOX_TEXTS, createdAt: string): Event =>
  at(index, createdAt, {
    type: "task.created",
    payload: {
      taskId: id,
      title: INBOX_TEXTS[id],
      presetId: "inbox",
      sourceText: INBOX_TEXTS[id],
      subtasks: [],
      fields: {},
    },
  });

/** The three inbox cards: 2 days, 5 hours and 6 days old. */
const inbox = (): readonly Event[] => [
  captured(51, INBOX_GRADE_ID, "2026-10-04T12:00:00.000Z"),
  captured(52, INBOX_SYNC_ID, "2026-10-06T07:00:00.000Z"),
  captured(53, INBOX_CABLE_ID, "2026-09-30T12:00:00.000Z"),
];

/** Sheet `k` was created on September `k`, due two days later and closed an hour early or five hours late. */
const doneSheet = (k: number): readonly Event[] => {
  const createdAt = addMinutesIso("2026-09-01T07:00:00.000Z", (k - 1) * DAY);
  const dueAt = addMinutesIso(createdAt, 2 * DAY + 14 * 60);
  const closedAt = addMinutesIso(dueAt, LATE_SHEETS.includes(k) ? 5 * 60 : -60);
  return [
    at(100 + 2 * k, createdAt, {
      type: "task.created",
      payload: {
        taskId: sheetId(k),
        title: `Algebra sheet ${k}`,
        presetId: "hw.algebra",
        projectId: ALGEBRA_ID,
        dueAt,
        dueTz: MOSCOW,
        subtasks: [],
        fields: {},
      },
    }),
    at(101 + 2 * k, closedAt, {
      type: "task.closed",
      payload: { taskId: sheetId(k), outcome: "done" },
    }),
  ];
};

const doneSheets = (): readonly Event[] =>
  Array.from({ length: DONE_SHEETS }, (_, index) => doneSheet(index + 1)).flat();

export const artboardEvents = (): readonly Event[] => [
  ...setup(),
  ...algebraHw6(),
  ...trk231(),
  ...waitingWork(),
  ...calculusHw5(),
  ...personal(),
  ...later(),
  ...inbox(),
  ...doneSheets(),
];

/** The artboard world as of `atIso` (events that occurred later are not part of it). */
export const artboardState = (atIso: string = NOW, extra: readonly Event[] = []): CoreState =>
  materializeAt([...artboardEvents(), ...extra], atIso, {
    reducer: coreReducer,
    initial: INITIAL_CORE_STATE,
  });

export const ctx = (now: string = NOW, deviceTz: string = MOSCOW): QueryContext => ({
  now,
  deviceTz,
});
