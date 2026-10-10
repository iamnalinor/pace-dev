import { describe, expect, it } from "vitest";

import {
  ALGEBRA_ID,
  artboardState,
  CALC_W41_ID,
  ctx,
  HW_ID,
  MOSCOW,
  WORK_ID,
} from "@pace/core/testing";

import { type ComposerEdits, composerModel, isPasted, requiresAiFirst } from "./composer.ts";

const state = artboardState();
const model = (text: string, edits: ComposerEdits = {}) =>
  composerModel(state, { text, edits }, ctx());

describe("composerModel", () => {
  it("is empty and personal before anything is typed", () => {
    expect(model("")).toMatchObject({
      isEmpty: true,
      preset: { id: "personal" },
      importance: "normal",
      target: { kind: "new" },
    });
  });

  it("routes homework problems to this week's instance of the course", () => {
    expect(model("дз по алгебре 1, 3, 5а")).toMatchObject({
      preset: { id: "hw.algebra", name: "Algebra HW", color: "yellow" },
      project: { id: ALGEBRA_ID },
      subtasks: [{ label: "1" }, { label: "3" }, { label: "5а" }],
      target: { kind: "instance", taskId: HW_ID },
    });
  });

  it("routes a pasted course homework with its deadline to that week, project untouched", () => {
    const calc = model(
      "Calculus HW: №№ 12, 14, 16 — найти пределы, сдать до 12 октября https://example.com/calc/3",
    );
    expect(calc).toMatchObject({
      preset: { id: "hw.calculus" },
      subtasks: [{ label: "12" }, { label: "14" }, { label: "16" }],
      target: { kind: "instance", taskId: CALC_W41_ID },
    });
    expect(calc.project?.id).not.toBe(ALGEBRA_ID);
  });

  it("gives homework with a deadline on another day a task of its own", () => {
    const friday = { at: "2026-10-09T20:59:00.000Z", tz: MOSCOW };
    expect(model("дз по алгебре 8", { due: friday }).target).toEqual({ kind: "new" });
    // HW 6 is due Wednesday: the same day keeps it in that week's homework.
    const wednesday = { at: "2026-10-07T15:00:00.000Z", tz: MOSCOW };
    expect(model("дз по алгебре 8", { due: wednesday }).target).toMatchObject({
      kind: "instance",
      taskId: HW_ID,
    });
  });

  it("lists the course's open weeks and lets a tap pick one, or a new task", () => {
    const hw = model("дз по алгебре 8");
    expect(hw.instances.map((option) => option.id)).toContain(HW_ID);
    expect(model("дз по алгебре 8", { targetTaskId: null }).target).toEqual({ kind: "new" });
    expect(model("дз по алгебре 8", { targetTaskId: HW_ID }).target).toMatchObject({
      kind: "instance",
      taskId: HW_ID,
    });
  });

  it("carries the assistant's description and a picked start", () => {
    const start = { at: "2026-10-08T06:00:00.000Z", tz: MOSCOW };
    expect(model("read the paper", { description: "the seminar one", start })).toMatchObject({
      description: "the seminar one",
      start,
    });
    expect(model("read the paper")).toMatchObject({ description: null, start: null });
  });

  it("shows a work sync's chips: project, due, estimate and link", () => {
    expect(model("синк по дашборду завтра 15:00 1ч https://meet.example.com/abc")).toMatchObject({
      title: "синк по дашборду",
      preset: { id: "work", color: "violet" },
      project: { id: WORK_ID, name: "Work" },
      due: { at: "2026-10-07T12:00:00.000Z", tz: MOSCOW },
      estimateMinutes: 60,
      link: { host: "meet.example.com", url: "https://meet.example.com/abc" },
      target: { kind: "new" },
    });
  });

  it("lets a chip tap win and preselects the new category's importance", () => {
    const deferred = model("buy a cable", { presetId: "deferred" });
    expect(deferred).toMatchObject({ preset: { id: "deferred" }, importance: "nice_to_have" });
    expect(model("срочно buy a cable", { presetId: "deferred" }).importance).toBe("asap");
    expect(
      model("buy a cable", { presetId: "deferred", importance: "prioritized" }).importance,
    ).toBe("prioritized");
  });

  it("clears a parsed field with null", () => {
    const cleared = model("синк завтра 1ч #Work", {
      due: null,
      estimateMinutes: null,
      projectId: null,
    });
    expect(cleared).toMatchObject({ due: null, estimateMinutes: null, project: null });
  });

  it("offers a #tag that matches no project as a new one", () => {
    expect(model("plan the trip #Japan")).toMatchObject({ newProjectName: "Japan", project: null });
  });

  it("lists categories without the inbox, and projects", () => {
    const { presets, projects } = model("x");
    expect(presets.map((preset) => preset.id)).not.toContain("inbox");
    expect(presets.map((preset) => preset.id)).toContain("hw.algebra");
    expect(projects.map((project) => project.id)).toContain(WORK_ID);
  });
});

describe("requiresAiFirst and isPasted", () => {
  it("makes Enter wait only for long or multi-line text", () => {
    expect(requiresAiFirst("call mom tomorrow")).toBe(false);
    expect(requiresAiFirst("first line\nsecond line")).toBe(true);
    expect(requiresAiFirst("  trailing newline only\n")).toBe(false);
    expect(
      requiresAiFirst(
        "№№ 290, 292, 293 — решить методом выделения линейных множителей (в 292 можно воспользоваться решением)",
      ),
    ).toBe(true);
  });

  it("tells a paste from typing: a jump of many characters at once", () => {
    expect(isPasted("", "№№ 290, 292, 293 — решить методом")).toBe(true);
    expect(isPasted("call mo", "call mom")).toBe(false);
    expect(isPasted("abc", "")).toBe(false);
  });
});
