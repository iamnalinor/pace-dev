import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { dayModel } from "../view-models/day.ts";
import { insightsModel } from "../view-models/insights.ts";
import { timeBarModel } from "../view-models/time-bar.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const later = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const ctx = (now: string) => ({ deviceTz: "Europe/Moscow", now });

describe("time actions", () => {
  it("switches with one tap and stops with a second tap on the running button", async () => {
    const world = await setupActions();
    unwrap(await world.actions.tapButton("btn:work"));
    world.setNow(later(50));
    unwrap(await world.actions.tapButton("btn:food"));
    const bar = timeBarModel(world.state.store.getState(), ctx(later(80)));
    expect(bar.running).toMatchObject({ expectMinutes: 30, label: "Food", minutes: 30, status: "ok" });
    expect(bar.buttons.find((button) => button.isRunning)?.id).toBe("btn:food");

    world.setNow(later(90));
    unwrap(await world.actions.tapButton("btn:food"));
    expect(timeBarModel(world.state.store.getState(), ctx(later(95))).running).toBeNull();
    const day = dayModel(world.state.store.getState(), null, ctx(later(95)));
    expect(day.entries.flatMap((entry) => (entry.kind === "activity" ? [[entry.row.label, entry.row.minutes]] : []))).toEqual([
      ["Work", 50],
      ["Food", 40],
    ]);
  });

  it("turns the default buttons into the account's own on the first edit", async () => {
    const world = await setupActions();
    unwrap(await world.actions.saveButton("btn:food", { category: "food", expectMinutes: 20, label: "Обед", limitMinutes: null }));
    unwrap(await world.actions.saveButton(null, { category: "study", expectMinutes: 45, label: "Reading", limitMinutes: 90 }));
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
    expect(bar.buttons.find((button) => button.label === "Reading")).toMatchObject({ color: "violet", limitMinutes: 90 });
    expect(await world.actions.saveButton(null, { category: "rest", expectMinutes: null, label: " ", limitMinutes: null })).toEqual({
      error: "action/empty-text",
      ok: false,
    });
  });

  it("focuses a task, logs the past and adjusts a block", async () => {
    const world = await setupActions();
    const taskId = Object.values(world.state.store.getState().tasks.byId).find((task) => task.title === "Algebra HW 6")?.id ?? "";
    unwrap(await world.actions.focusTask(taskId));
    world.setNow(later(60));
    unwrap(await world.actions.stopActivity());
    unwrap(
      await world.actions.logPast({ category: "food", endAt: later(-30), label: "Breakfast", startAt: later(-60) }),
    );
    expect(
      await world.actions.logPast({ category: "food", endAt: later(-60), label: "Bad", startAt: later(-30) }),
    ).toEqual({ error: "action/invalid-input", ok: false });
    const state = world.state.store.getState();
    const focus = Object.values(state.time.activities).find((activity) => activity.taskId === taskId);
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
  });
});
