import { describe, expect, it } from "vitest";

import type { Event, EventInput } from "../events/event-schema.ts";

import { materialize } from "../materialize/materializer.ts";
import {
  algebraHw6Events,
  at,
  event,
  HW_CREATED,
  HW_ID,
  solved,
  submitted,
  trk231Events,
  TRK_ID,
} from "../materialize/task-fixture.fake.ts";
import { taskReducer } from "../materialize/task-reducer.ts";
import { INITIAL_TASKS_STATE } from "../model/task.ts";
import { exampleCoursePresetEvents } from "../presets/example-presets.ts";
import { INITIAL_PRESETS_STATE, presetReducer } from "../presets/preset-reducer.ts";
import { addMinutesIso } from "../time.ts";
import { FUTURE_TOLERANCE_MINUTES, validateEventInput } from "./retro-rules.ts";

const NOW = "2026-10-06T12:00:00.000Z";
const T = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;
const AT = T(11);

const presets = materialize(
  exampleCoursePresetEvents(HW_CREATED).map((input, index) => event(100 + index, input)),
  presetReducer,
  INITIAL_PRESETS_STATE,
);

const stateOf = (events: readonly Event[]) => ({
  tasks: materialize(events, taskReducer, INITIAL_TASKS_STATE),
  presets,
});

const hw6 = stateOf([...algebraHw6Events(), ...trk231Events()]);
const closedHw6 = stateOf([
  ...algebraHw6Events(),
  at(7, T(9), { type: "task.closed", payload: { taskId: HW_ID, outcome: "cancelled" } }),
]);

const check = (input: EventInput, state = hw6) => validateEventInput(state, input, NOW);

const errorOf = (input: EventInput, state = hw6) => {
  const result = check(input, state);
  return result.ok ? "ok" : result.error;
};

const created = (occurredAt: string, presetId: string, taskId = "new"): Event =>
  at(50, occurredAt, {
    type: "task.created",
    payload: { taskId, title: "New", presetId, subtasks: [], fields: {} },
  });

describe("validateEventInput: pass-through", () => {
  it("returns the same input on success", () => {
    const input = solved(20, AT, "s5");
    expect(check(input)).toEqual({ ok: true, value: input });
  });

  it("lets corrections and non-task events through, even in the future", () => {
    const later = addMinutesIso(NOW, 60);
    const revoke = at(20, later, { type: "event.revoked", payload: { targetId: "x" } });
    const amend = at(21, later, { type: "event.amended", payload: { targetId: "x", patch: {} } });
    const project = at(22, later, {
      type: "project.created",
      payload: { projectId: "p", name: "Algebra" },
    });
    const settings = at(23, later, { type: "settings.updated", payload: { language: "ru" } });
    for (const input of [revoke, amend, project, settings]) {
      expect(errorOf(input)).toBe("ok");
    }
  });
});

describe("validateEventInput: retro/future", () => {
  it("tolerates clock skew up to five minutes", () => {
    expect(FUTURE_TOLERANCE_MINUTES).toBe(5);
    const edge = addMinutesIso(NOW, FUTURE_TOLERANCE_MINUTES);
    expect(errorOf(solved(20, edge, "s5"))).toBe("ok");
    const past = addMinutesIso(edge, 0).replace(".000Z", ".001Z");
    expect(errorOf(solved(21, past, "s5"))).toBe("retro/future");
  });

  it("is checked before the task itself", () => {
    const later = addMinutesIso(NOW, 10);
    expect(errorOf(solved(20, later, { id: "s1", taskId: "nope" }))).toBe("retro/future");
    expect(errorOf(created(later, "hw"))).toBe("retro/future");
  });
});

describe("validateEventInput: task.created and task.preset.set", () => {
  it("accepts a known preset and rejects an unknown one", () => {
    expect(errorOf(created(AT, "hw.algebra"))).toBe("ok");
    expect(errorOf(created(AT, "hw"))).toBe("ok");
    expect(errorOf(created(AT, "hw.nope"))).toBe("preset/unknown");
    const switched = at(20, AT, {
      type: "task.preset.set",
      payload: { taskId: HW_ID, presetId: "work" },
    });
    expect(errorOf(switched)).toBe("ok");
    const broken = at(21, AT, {
      type: "task.preset.set",
      payload: { taskId: HW_ID, presetId: "nope" },
    });
    expect(errorOf(broken)).toBe("preset/unknown");
  });

  it("lets a repeated creation through (deterministic instance ids are idempotent)", () => {
    expect(errorOf(created(AT, "hw.algebra", HW_ID))).toBe("ok");
  });
});

describe("validateEventInput: task/unknown and retro/before-created", () => {
  it("rejects events on unknown tasks", () => {
    expect(errorOf(solved(20, AT, { id: "s1", taskId: "nope" }))).toBe("task/unknown");
    const close = at(21, AT, {
      type: "task.closed",
      payload: { taskId: "nope", outcome: "done" },
    });
    expect(errorOf(close)).toBe("task/unknown");
  });

  it("rejects anything that happened before the task was created, closing included", () => {
    const early = addMinutesIso(HW_CREATED, -1);
    expect(errorOf(solved(20, early, "s1"))).toBe("retro/before-created");
    const close = at(21, early, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "done" },
    });
    expect(errorOf(close)).toBe("retro/before-created");
    const rename = at(22, early, { type: "task.updated", payload: { taskId: HW_ID, title: "x" } });
    expect(errorOf(rename)).toBe("retro/before-created");
    expect(errorOf(solved(23, HW_CREATED, "s5"))).toBe("ok");
  });
});

describe("validateEventInput: retro/task-closed", () => {
  it("rejects work on a closed task without a reopen", () => {
    const progress = at(20, AT, {
      type: "task.progress.set",
      payload: { taskId: HW_ID, progress: 3 },
    });
    const status = at(21, AT, {
      type: "task.status.set",
      payload: { taskId: HW_ID, status: "paused" },
    });
    const focus = at(22, AT, { type: "focus.started", payload: { taskId: HW_ID } });
    const cases = [
      solved(23, AT, "s5"),
      submitted(24, AT, { subtaskIds: ["s3"] }),
      progress,
      status,
      focus,
    ];
    for (const input of cases) {
      expect(errorOf(input, closedHw6)).toBe("retro/task-closed");
    }
  });

  it("allows reopening, editing and re-closing a closed task", () => {
    const reopen = at(20, AT, { type: "task.reopened", payload: { taskId: HW_ID } });
    const rename = at(21, AT, { type: "task.updated", payload: { taskId: HW_ID, title: "x" } });
    const close = at(22, AT, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "done" },
    });
    for (const input of [reopen, rename, close]) {
      expect(errorOf(input, closedHw6)).toBe("ok");
    }
  });
});

describe("validateEventInput: subtasks and submissions", () => {
  it("rejects unknown subtasks", () => {
    expect(errorOf(solved(20, AT, "nope"))).toBe("subtask/unknown");
    expect(errorOf(submitted(21, AT, { subtaskIds: ["s3", "nope"] }))).toBe("subtask/unknown");
  });

  it("rejects a submission with nothing to submit", () => {
    expect(errorOf(submitted(20, AT, { subtaskIds: ["s5"] }))).toBe("retro/nothing-to-submit");
    expect(errorOf(submitted(21, AT, { subtaskIds: ["s3", "s5"] }))).toBe(
      "retro/nothing-to-submit",
    );
    expect(errorOf(submitted(22, AT, { subtaskIds: ["s1"] }))).toBe("retro/nothing-to-submit");
    expect(errorOf(submitted(23, AT, { subtaskIds: ["s3", "s4"], closes: true }))).toBe("ok");
  });

  it("requires a solved subtask for a whole submission of a per-subtask task", () => {
    const fresh = stateOf([algebraHw6Events()[0] ?? solved(0, T(0), "s1")]);
    expect(errorOf(submitted(20, AT, {}), fresh)).toBe("retro/nothing-to-submit");
    expect(errorOf(submitted(21, AT, {}))).toBe("ok");
    expect(errorOf(submitted(22, AT, { closes: true, taskId: TRK_ID }))).toBe("ok");
  });
});
