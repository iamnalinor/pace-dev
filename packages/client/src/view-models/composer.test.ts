import { describe, expect, it } from "vitest";

import { ALGEBRA_ID, artboardState, ctx, HW_ID, MOSCOW, WORK_ID } from "@pace/core/testing";

import { type ComposerEdits, composerModel, shouldAiRead } from "./composer.ts";

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
      preset: { id: "hw.algebra", name: "Algebra HW", color: "blue" },
      project: { id: ALGEBRA_ID },
      subtasks: [{ label: "1" }, { label: "3" }, { label: "5а" }],
      target: { kind: "instance", taskId: HW_ID },
    });
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

describe("shouldAiRead", () => {
  it("sends long or multi-line text to the assistant and keeps short lines on the rules", () => {
    expect(shouldAiRead("call mom tomorrow")).toBe(false);
    expect(shouldAiRead("first line\nsecond line")).toBe(true);
    expect(shouldAiRead("  trailing newline only\n")).toBe(false);
    expect(
      shouldAiRead(
        "№№ 290, 292, 293 — решить методом выделения линейных множителей (в 292 можно воспользоваться решением)",
      ),
    ).toBe(true);
  });
});
