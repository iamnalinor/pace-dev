import type { Event, EventInput } from "../events/event-schema.ts";
import type { Subtask, Task } from "../model/task.ts";

/** Fixed, valid ULIDs: `stamp(7)` sorts after `stamp(6)`, so indexes double as order. */
export const stamp = (index: number): string =>
  `01ARZ3NDEKTSV4RRFFQ69G5${String(index).padStart(3, "0")}`;

export const event = (index: number, input: EventInput): Event => ({
  ...input,
  deviceId: "d",
  id: input.id ?? stamp(index),
  recordedAt: input.recordedAt ?? input.occurredAt,
});

type Body<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

type Extra = Partial<Pick<EventInput, "id" | "precision" | "source">>;

/** A task event at `occurredAt`; the envelope defaults to `exact` from the app. */
export const at = (index: number, occurredAt: string, body: Body & Extra): Event =>
  event(index, { occurredAt, precision: "exact", source: "app", ...body });

export const subtask = (id: string, label: string, number: null | number = null): Subtask => ({
  id,
  label,
  number,
  solvedAt: null,
  submittedAt: null,
});

/** Algebra HW 6 from the artboard: issued Monday 10:00 Moscow, due Wednesday 23:59. */
export const HW_ID = "hw:hw.algebra:2026-W41";
export const HW_CREATED = "2026-10-05T07:00:00.000Z";
export const HW_DUE = "2026-10-07T20:59:00.000Z";
export const HW_TZ = "Europe/Moscow";

export const HW_PROBLEMS = [
  { id: "s1", label: "Matrix rank", number: 1 },
  { id: "s2", label: "Gauss elimination", number: 2 },
  { id: "s3", label: "Inverse via adjugate", number: 3 },
  { id: "s4", label: "Determinant 4×4", number: 4 },
  { id: "s5", label: "Kronecker–Capelli", number: 5 },
  { id: "s6", label: "Block matrices", number: 6 },
  { id: "s7", label: "7a Bonus" },
] as const;

export const hwCreated = (index = 1): Event =>
  at(index, HW_CREATED, {
    type: "task.created",
    payload: {
      taskId: HW_ID,
      title: "Algebra HW 6",
      presetId: "hw.algebra",
      dueAt: HW_DUE,
      dueTz: HW_TZ,
      subtasks: [...HW_PROBLEMS],
      fields: {},
    },
  });

export const solved = (
  index: number,
  occurredAt: string,
  target: string | { readonly id: string; readonly taskId: string },
): Event =>
  at(index, occurredAt, {
    type: "task.subtask.solved",
    payload:
      typeof target === "string"
        ? { taskId: HW_ID, subtaskId: target }
        : { taskId: target.taskId, subtaskId: target.id },
  });

export const submitted = (
  index: number,
  occurredAt: string,
  payload: {
    readonly subtaskIds?: readonly string[];
    readonly closes?: boolean;
    readonly taskId?: string;
  },
): Event =>
  at(index, occurredAt, {
    type: "task.submitted",
    payload: {
      taskId: payload.taskId ?? HW_ID,
      ...(payload.subtaskIds !== undefined && { subtaskIds: [...payload.subtaskIds] }),
      ...(payload.closes !== undefined && { closes: payload.closes }),
    },
  });

/** Problems 1–2 solved and sent on Monday, 3–4 solved on Tuesday: "4 solved · 2 sent". */
export const algebraHw6Events = (): readonly Event[] => [
  hwCreated(1),
  solved(2, "2026-10-05T12:00:00.000Z", "s1"),
  solved(3, "2026-10-05T12:30:00.000Z", "s2"),
  submitted(4, "2026-10-05T13:00:00.000Z", { subtaskIds: ["s1", "s2"] }),
  solved(5, "2026-10-06T07:00:00.000Z", "s3"),
  solved(6, "2026-10-06T08:00:00.000Z", "s4"),
];

/** TRK-231 from the artboard: a Prioritized work task started Monday, due Friday, slider at 4. */
export const TRK_ID = "01ARZ3NDEKTSV4RRFFQ69G5TRK";
export const TRK_CREATED = "2026-10-05T09:00:00.000Z";
export const TRK_DUE = "2026-10-09T18:00:00.000Z";

export const trk231Events = (): readonly Event[] => [
  at(11, TRK_CREATED, {
    type: "task.created",
    payload: {
      taskId: TRK_ID,
      title: "Flaky latency test in nightly",
      presetId: "work",
      importance: "prioritized",
      startAt: TRK_CREATED,
      startTz: "UTC",
      dueAt: TRK_DUE,
      dueTz: "UTC",
      estimateMinutes: 480,
      subtasks: [],
      description: "p99 check fails ~1 in 5 runs on the shared runner.",
      fields: { link: "https://tracker.example.com/browse/TRK-231" },
    },
  }),
  at(12, "2026-10-06T10:00:00.000Z", {
    type: "task.progress.set",
    payload: { taskId: TRK_ID, progress: 4 },
  }),
];

/** A plain open task; override what a test needs. */
export const taskFixture = (overrides: Partial<Task> = {}): Task => ({
  id: HW_ID,
  title: "Algebra HW 6",
  presetId: "hw.algebra",
  projectId: null,
  importance: null,
  importanceSetAt: null,
  dueAt: HW_DUE,
  dueTz: HW_TZ,
  startAt: null,
  startTz: null,
  estimateMinutes: null,
  subtasks: [],
  slider: null,
  description: null,
  sourceText: null,
  sources: [],
  fields: { link: null, submitVia: null },
  overrides: null,
  status: "not_started",
  statusSince: HW_CREATED,
  waitingMinutes: 0,
  touched: false,
  rank: null,
  createdAt: HW_CREATED,
  submittedAt: null,
  closed: null,
  reopenedAt: null,
  lastEventAt: HW_CREATED,
  ...overrides,
});
