import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { setupActions, unwrap } from "../actions/fixture.fake.ts";
import { nowViewModel } from "./now.ts";
import { taskChoices, timeBarModel } from "./time-bar.ts";

const ctx = { deviceTz: "Europe/Moscow", now: NOW };

const runningButtons = (world: Awaited<ReturnType<typeof setupActions>>): readonly string[] =>
  timeBarModel(world.state.store.getState(), ctx)
    .buttons.filter((button) => button.isRunning)
    .map((button) => button.id);

describe("timeBarModel", () => {
  it("shows Calendar, Task, Chores and Rest, each with its own kind", async () => {
    const world = await setupActions();
    expect(
      timeBarModel(world.state.store.getState(), ctx).buttons.map((button) => [
        button.id,
        button.kind,
      ]),
    ).toEqual([
      ["calendar", "calendar"],
      ["task", "task"],
      ["chores", "choices"],
      ["rest", "choices"],
    ]);
  });

  it("has Task on while Focus on a task runs, and only Task", async () => {
    const world = await setupActions();
    const { tasks } = world.state.store.getState();
    const taskId = Object.values(tasks.byId).find((task) => task.title === "Algebra HW 6")?.id;
    unwrap(await world.actions.focusTask(taskId ?? ""));
    expect(runningButtons(world)).toEqual(["task"]);
    unwrap(await world.actions.startChoice("rest:walk"));
    expect(runningButtons(world)).toEqual(["rest"]);
    unwrap(await world.actions.startTyped("Reading"));
    expect(runningButtons(world)).toEqual([]);
  });

  it("names the task in focus once, for the Task button, its picker and the task's Focus", async () => {
    const world = await setupActions();
    const { tasks } = world.state.store.getState();
    const taskId = Object.values(tasks.byId).find((task) => task.title === "Algebra HW 6")?.id;
    const bar = () => timeBarModel(world.state.store.getState(), ctx);
    expect(bar().focusedTaskId).toBeNull();
    unwrap(await world.actions.focusTask(taskId ?? ""));
    expect(bar().focusedTaskId).toBe(taskId);
    // A button's choice that also names a task (the assistant can start one so) belongs to the
    // button: Rest is on, Task is not, and no task reads as in focus anywhere.
    unwrap(
      await world.actions.startActivity({
        buttonId: "rest:walk",
        category: "rest",
        label: "Walk",
        taskId,
      }),
    );
    expect(bar().focusedTaskId).toBeNull();
    expect(runningButtons(world)).toEqual(["rest"]);
  });

  it("marks the running choice in Rest's list", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("rest:nap"));
    const rest = timeBarModel(world.state.store.getState(), ctx).buttons.find(
      (button) => button.id === "rest",
    );
    expect(rest?.choices.filter((choice) => choice.isRunning).map((choice) => choice.id)).toEqual([
      "rest:nap",
    ]);
    expect(timeBarModel(world.state.store.getState(), ctx).running).toMatchObject({
      category: "sleep",
      expectMinutes: 30,
      label: "Nap",
    });
  });
});

/** Now's board over the artboard world. */
const board = async () => {
  const world = await setupActions();
  return nowViewModel(world.state.store.getState(), ctx);
};

describe("taskChoices", () => {
  it("lists the open tasks in Now's order, the later ones last", async () => {
    const now = await board();
    expect(taskChoices(now, "").map((row) => row.id)).toEqual(
      [...now.rows, ...now.future].map((row) => row.id),
    );
  });

  it("keeps the tasks whose title has every word typed, in any case and order", async () => {
    const now = await board();
    expect(taskChoices(now, "  hw ALGEBRA ").map((row) => row.title)).toEqual(["Algebra HW 6"]);
    expect(taskChoices(now, "no such task")).toEqual([]);
  });

  it("reads ё as е, the way people type Russian", () => {
    const row = { id: "t1", title: "Отчёт по практике" };
    expect(taskChoices({ future: [], rows: [row] }, "отчет")).toEqual([row]);
    expect(taskChoices({ future: [], rows: [row] }, "ОТЧЁТ практ")).toEqual([row]);
  });
});
