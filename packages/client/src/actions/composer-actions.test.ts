import { describe, expect, it } from "vitest";

import { ctx, HW_ID, MOSCOW, WORK_ID } from "@pace/core/testing";

import { composerModel } from "../view-models/composer.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const read = (world: Awaited<ReturnType<typeof setupActions>>, text: string) =>
  composerModel(world.state.store.getState(), { text }, ctx());

describe("createFromComposer", () => {
  it("creates a task from the chips, storing the importance and the typed line", async () => {
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
      sourceText: text,
      fields: { link: "https://meet.example.com/abc" },
    });
  });

  it("adds typed problems to this week's homework instead of a new task", async () => {
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

  it("keeps the description and extra problems of the expanded composer", async () => {
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

  it("refuses an empty line", async () => {
    const world = await setupActions();
    expect(await world.actions.createFromComposer(read(world, "  "))).toEqual({
      ok: false,
      error: "action/empty-text",
    });
  });
});
