import { describe, expect, it } from "vitest";

import { ctx, HW_ID, MOSCOW, WORK_ID } from "@pace/core/testing";

import { composerModel } from "../view-models/composer.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const read = (world: Awaited<ReturnType<typeof setupActions>>, text: string) =>
  composerModel(world.state.store.getState(), { text }, ctx());

describe("createFromComposer", () => {
  it("creates a task from the chips, storing the importance, not the typed line", async () => {
    const world = await setupActions();
    const text = "синк по дашборду завтра 15:00 1ч https://meet.example.com/abc";
    const [created] = unwrap(await world.actions.createFromComposer(read(world, text)));
    expect(created?.type).toBe("task.created");
    expect(created?.payload).toMatchObject({
      title: "синк по дашборду",
      presetId: "work",
      projectId: WORK_ID,
      importance: "normal",
      dueAt: "2026-10-07T12:00:00.000Z",
      dueTz: MOSCOW,
      estimateMinutes: 60,
      fields: { link: "https://meet.example.com/abc" },
    });
    // Typed by hand, the line is the task: there is no original message to keep.
    expect(created?.type === "task.created" && created.payload.sourceText).toBeUndefined();
  });

  it("keeps the message the assistant read as the task's source", async () => {
    const world = await setupActions();
    const text = "пришло дз: разобрать почту до пятницы";
    const [created] = unwrap(
      await world.actions.createFromComposer(read(world, text), { readByAssistant: true }),
    );
    expect(created?.type === "task.created" && created.payload.sourceText).toBe(text);
  });

  it("adds typed subtasks to this week's homework instead of a new task", async () => {
    const world = await setupActions();
    const before = world.state.store.getState().tasks.byId[HW_ID]?.subtasks.length ?? 0;
    const events = unwrap(
      await world.actions.createFromComposer(read(world, "дз по алгебре 8, 9"), {
        subtasks: ["Bonus"],
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "task.subtasks.added",
      "task.source.attached",
    ]);
    const task = world.state.store.getState().tasks.byId[HW_ID];
    expect(task?.subtasks.slice(before).map((subtask) => subtask.label)).toEqual([
      "8",
      "9",
      "Bonus",
    ]);
  });

  it("creates a project named by a new #tag", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.createFromComposer(read(world, "plan the trip #Japan")),
    );
    expect(events.map((event) => event.type)).toEqual(["project.created", "task.created"]);
  });

  it("keeps the description and extra subtasks of the expanded composer", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createFromComposer(read(world, "read the paper"), {
        description: "  the one from the seminar ",
        subtasks: [" intro ", ""],
      }),
    );
    expect(created?.payload).toMatchObject({
      description: "the one from the seminar",
      subtasks: [{ label: "intro" }],
    });
  });

  it("stores the start and the assistant's description on a new task", async () => {
    const world = await setupActions();
    const start = { at: "2026-10-08T06:00:00.000Z", tz: MOSCOW };
    const model = composerModel(
      world.state.store.getState(),
      { edits: { description: "the seminar one", start }, text: "read the paper" },
      ctx(),
    );
    const [created] = unwrap(await world.actions.createFromComposer(model));
    expect(created?.payload).toMatchObject({
      description: "the seminar one",
      startAt: start.at,
      startTz: MOSCOW,
    });
  });

  it("brings the description, the link and a stated estimate to this week's homework", async () => {
    const world = await setupActions();
    const model = composerModel(
      world.state.store.getState(),
      {
        edits: { description: "Метод линейных множителей", estimateMinutes: 120 },
        text: "дз по алгебре 8, 9 https://example.com/sheet",
      },
      ctx(),
    );
    const events = unwrap(await world.actions.createFromComposer(model));
    expect(events.map((event) => event.type)).toEqual([
      "task.subtasks.added",
      "task.updated",
      "task.estimate.set",
      "task.source.attached",
    ]);
    const task = world.state.store.getState().tasks.byId[HW_ID];
    expect(task).toMatchObject({
      estimateMinutes: 120,
      fields: { link: "https://example.com/sheet" },
    });
    expect(task?.description).toContain("Метод линейных множителей");
  });

  it("adds a title typed in the form over an empty line", async () => {
    const world = await setupActions();
    const model = composerModel(
      world.state.store.getState(),
      { edits: { title: "read the paper" }, text: "" },
      ctx(),
    );
    expect(model.canAdd).toBe(true);
    const [created] = unwrap(await world.actions.createFromComposer(model));
    expect(created?.payload).toMatchObject({ title: "read the paper" });
  });

  it("never refuses a model that can be added", async () => {
    const world = await setupActions();
    const drafts = [
      { text: "" },
      { text: "  " },
      { text: "read the paper" },
      { edits: { title: "by hand" }, text: "" },
      { edits: { title: " " }, text: "read the paper" },
      { text: "дз по алгебре 8" },
      { edits: { title: "" }, text: "дз по алгебре 8" },
    ];
    const agrees: Record<string, boolean> = {};
    for (const draft of drafts) {
      const model = composerModel(world.state.store.getState(), draft, ctx());
      const result = await world.actions.createFromComposer(model);
      // Refused as empty exactly when the model said it cannot be added.
      agrees[JSON.stringify(draft)] =
        !result.ok && result.error === "action/empty-text" ? !model.canAdd : model.canAdd;
    }
    expect(Object.values(agrees).every(Boolean)).toBe(true);
  });

  it("refuses an empty line", async () => {
    const world = await setupActions();
    expect(await world.actions.createFromComposer(read(world, "  "))).toEqual({
      ok: false,
      error: "action/empty-text",
    });
  });
});
