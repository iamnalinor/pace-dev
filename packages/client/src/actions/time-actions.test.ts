import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { dayModel } from "../view-models/day.ts";
import { insightsModel } from "../view-models/insights.ts";
import { timeBarModel } from "../view-models/time-bar.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const later = (minutes: number): string =>
  new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const ctx = (now: string) => ({ deviceTz: "Europe/Moscow", now });

describe("time actions", () => {
  it("switches with one tap and stops with a second tap on the running button", async () => {
    const world = await setupActions();
    unwrap(await world.actions.tapButton("btn:work"));
    world.setNow(later(50));
    unwrap(await world.actions.tapButton("btn:food"));
    const bar = timeBarModel(world.state.store.getState(), ctx(later(80)));
    expect(bar.running).toMatchObject({
      expectMinutes: 30,
      label: "Food",
      minutes: 30,
      status: "ok",
    });
    expect(bar.buttons.find((button) => button.isRunning)?.id).toBe("btn:food");

    world.setNow(later(90));
    unwrap(await world.actions.tapButton("btn:food"));
    const after = world.state.store.getState();
    const at = ctx(later(95));
    expect(timeBarModel(after, at).running).toBeNull();
    const day = dayModel(after, null, at);
    const rowOf = (entry: (typeof day.entries)[number]) =>
      entry.kind === "activity" ? [[entry.row.label, entry.row.minutes]] : [];
    expect(day.entries.flatMap((entry) => rowOf(entry))).toEqual([
      ["Work", 50],
      ["Food", 40],
    ]);
  });

  it("marks a block as one where the messengers were the point, and stops at a past instant", async () => {
    const world = await setupActions();
    unwrap(await world.actions.tapButton("btn:work"));
    const day = dayModel(world.state.store.getState(), null, ctx(later(10)));
    const running = day.entries.find((entry) => entry.kind === "activity");
    const activityId = running?.kind === "activity" ? running.row.activityId : "";
    unwrap(await world.actions.relabelActivity(activityId, { messengersOnPurpose: true }));
    world.setNow(later(90));
    unwrap(await world.actions.stopActivity({ at: later(60) }));
    const after = dayModel(world.state.store.getState(), null, ctx(later(95)));
    expect(after.entries.find((entry) => entry.kind === "activity")).toMatchObject({
      row: { isRunning: false, messengersOnPurpose: true, minutes: 60 },
    });
  });

  it("leaves a day with nothing on it empty instead of one long gap", async () => {
    const world = await setupActions();
    expect(dayModel(world.state.store.getState(), null, ctx(NOW)).entries).toEqual([]);
  });

  it("turns the default buttons into the account's own on the first edit", async () => {
    const world = await setupActions();
    unwrap(
      await world.actions.saveButton("btn:food", {
        category: "food",
        expectMinutes: 20,
        label: "Обед",
        limitMinutes: null,
      }),
    );
    unwrap(
      await world.actions.saveButton(null, {
        category: "study",
        expectMinutes: 45,
        label: "Reading",
        limitMinutes: 90,
      }),
    );
    unwrap(await world.actions.removeButton("btn:sleep"));
    const bar = timeBarModel(world.state.store.getState(), ctx(NOW));
    expect(bar.buttons.map((button) => button.label)).toEqual([
      "Work",
      "Study",
      "Обед",
      "Commute",
      "Rest",
      "Sport",
      "Chores",
      "Reading",
    ]);
    expect(bar.buttons.find((button) => button.label === "Reading")).toMatchObject({
      color: "violet",
      limitMinutes: 90,
    });
    expect(
      await world.actions.saveButton(null, {
        category: "rest",
        expectMinutes: null,
        label: " ",
        limitMinutes: null,
      }),
    ).toEqual({
      error: "action/empty-text",
      ok: false,
    });
  });

  it("focuses a task, logs the past and adjusts a block", async () => {
    const world = await setupActions();
    const taskId =
      Object.values(world.state.store.getState().tasks.byId).find(
        (task) => task.title === "Algebra HW 6",
      )?.id ?? "";
    unwrap(await world.actions.focusTask(taskId));
    world.setNow(later(60));
    unwrap(await world.actions.stopActivity());
    unwrap(
      await world.actions.logPast({
        category: "food",
        endAt: later(-30),
        label: "Breakfast",
        startAt: later(-60),
      }),
    );
    expect(
      await world.actions.logPast({
        category: "food",
        endAt: later(-60),
        label: "Bad",
        startAt: later(-30),
      }),
    ).toEqual({ error: "action/invalid-input", ok: false });
    const state = world.state.store.getState();
    const focus = Object.values(state.time.activities).find(
      (activity) => activity.taskId === taskId,
    );
    expect(focus).toMatchObject({ category: "task", label: "Algebra HW 6" });
    unwrap(await world.actions.adjustActivity(focus?.id ?? "", { startAt: later(-10) }));
    const day = dayModel(world.state.store.getState(), null, ctx(later(61)));
    expect(day.trackedMinutes).toBe(100);
    const week = insightsModel(world.state.store.getState(), null, ctx(later(61)));
    expect(week.byCategory.map((bar) => [bar.key, bar.minutes])).toEqual([
      ["task", 70],
      ["food", 30],
    ]);
    expect(week.byProject[0]).toMatchObject({ minutes: 70, name: "Algebra" });
    // The task time is focus time: it shows by hour and as one unbroken block.
    expect(week.hours.minutes.reduce((sum, minutes) => sum + minutes, 0)).toBe(70);
    expect(week.hours.peak).not.toBeNull();
    expect(week.fragmentation).toMatchObject({ focusBlocks: 1, medianFocusMinutes: 70 });
    expect(week.focusSleep.at(-1)).toMatchObject({ focusMinutes: 70, sleepMinutes: null });
  });

  it("saves the Day sheet: a logged block, then a move and a rename in one go", async () => {
    const world = await setupActions();
    const logged = unwrap(
      await world.actions.saveActivity(
        { endAt: later(-60), kind: "log", startAt: later(-120) },
        { category: "study", endAt: later(-60), label: "Lecture", startAt: later(-120) },
      ),
    );
    const [event] = logged;
    const activityId = event?.type === "activity.logged" ? event.payload.activityId : "";
    const edited = unwrap(
      await world.actions.saveActivity(
        {
          activityId,
          category: "study",
          endAt: later(-60),
          kind: "edit",
          label: "Lecture",
          startAt: later(-120),
        },
        { category: "work", endAt: later(-50), label: "Seminar", startAt: later(-120) },
      ),
    );
    expect(edited.map((item) => item.type)).toEqual(["activity.adjusted", "activity.labelled"]);
    expect(world.state.store.getState().time.activities[activityId]).toMatchObject({
      category: "work",
      endAt: later(-50),
      label: "Seminar",
    });
    const unchanged = await world.actions.saveActivity(
      {
        activityId,
        category: "work",
        endAt: later(-50),
        kind: "edit",
        label: "Seminar",
        startAt: later(-120),
      },
      { category: "work", endAt: later(-50), label: "Seminar", startAt: later(-120) },
    );
    expect(unwrap(unchanged)).toEqual([]);
    const noEnd = await world.actions.saveActivity(
      { endAt: later(-60), kind: "log", startAt: later(-120) },
      { category: "work", endAt: null, label: "x", startAt: later(-120) },
    );
    expect(noEnd).toEqual({ error: "action/invalid-input", ok: false });
  });
});
