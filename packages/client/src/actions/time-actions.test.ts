import { describe, expect, it } from "vitest";

import { NOW } from "@pace/core/testing";

import { dayModel } from "../view-models/day.ts";
import { insightsModel } from "../view-models/insights.ts";
import { nowViewModel } from "../view-models/now.ts";
import { timeBarModel } from "../view-models/time-bar.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const later = (minutes: number): string =>
  new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const ctx = (now: string) => ({ deviceTz: "Europe/Moscow", now });

describe("time actions", () => {
  it("switches with one tap and stops with a second tap on the running choice", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("sport:60"));
    world.setNow(later(50));
    unwrap(await world.actions.startChoice("chores:eating"));
    const bar = timeBarModel(world.state.store.getState(), ctx(later(80)));
    expect(bar.running).toMatchObject({
      expectMinutes: 30,
      label: "Eating",
      minutes: 30,
      status: "ok",
    });
    expect(bar.buttons.find((button) => button.isRunning)?.id).toBe("chores");

    world.setNow(later(90));
    unwrap(await world.actions.startChoice("chores:eating"));
    const after = world.state.store.getState();
    const at = ctx(later(95));
    expect(timeBarModel(after, at).running).toBeNull();
    const day = dayModel(after, null, at);
    const rowOf = (entry: (typeof day.entries)[number]) =>
      entry.kind === "activity" ? [[entry.row.label, entry.row.minutes]] : [];
    expect(day.entries.flatMap((entry) => rowOf(entry))).toEqual([
      ["Sport", 50],
      ["Eating", 40],
    ]);
  });

  it("asks whether it is still going at twice the Expect", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("rest"));
    const at = (minutes: number) =>
      timeBarModel(world.state.store.getState(), ctx(later(minutes))).running?.status;
    expect(at(45)).toBe("ok");
    expect(at(60)).toBe("long");
    world.setNow(later(70));
    const running = timeBarModel(world.state.store.getState(), ctx(later(70))).running;
    unwrap(await world.actions.stillGoing(running?.activityId ?? ""));
    expect(at(100)).toBe("ok");
    expect(at(140)).toBe("long");
    const after = timeBarModel(world.state.store.getState(), ctx(later(100)));
    expect(after.running).toMatchObject({
      expectMinutes: 30,
      remindAt: later(140),
    });
  });

  it("deletes a block from the day: the event that made it is revoked", async () => {
    const world = await setupActions();
    const [event] = unwrap(
      await world.actions.logPast({
        category: "study",
        endAt: later(-60),
        label: "Lecture",
        startAt: later(-120),
      }),
    );
    const activityId = event?.type === "activity.logged" ? event.payload.activityId : "";
    unwrap(await world.actions.deleteActivity(activityId));
    expect(world.state.store.getState().time.activities[activityId]).toBeUndefined();
    expect(await world.actions.deleteActivity(activityId)).toEqual({
      error: "event/not-found",
      ok: false,
    });
  });

  it("runs an activity alongside: the main one keeps going, each stops on its own", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("chores:commute"));
    world.setNow(later(5));
    unwrap(await world.actions.startTyped("Podcast", { alongside: true }));
    const bar = timeBarModel(world.state.store.getState(), ctx(later(10)));
    expect(bar.running).toMatchObject({ label: "Commute" });
    expect(bar.alongside).toEqual([
      expect.objectContaining({ isAlongside: true, label: "Podcast" }),
    ]);
    const podcast = bar.alongside[0]?.activityId ?? "";
    world.setNow(later(20));
    unwrap(await world.actions.stopActivity({ activityId: podcast }));
    const after = timeBarModel(world.state.store.getState(), ctx(later(21)));
    expect(after.running).toMatchObject({ label: "Commute" });
    expect(after.alongside).toEqual([]);
  });

  it("starts what was typed at once, a length in it as the Expect", async () => {
    const world = await setupActions();
    unwrap(
      await world.actions.logPast({
        category: "study",
        endAt: later(-30),
        label: "Lecture",
        startAt: later(-90),
      }),
    );
    unwrap(await world.actions.startTyped(" lecture "));
    const running = (minute: number) =>
      timeBarModel(world.state.store.getState(), ctx(later(minute))).running;
    expect(running(1)).toMatchObject({ category: "study", label: "lecture" });
    world.setNow(later(10));
    unwrap(await world.actions.startTyped("Пошел в ЦСС, 20мин"));
    expect(running(11)).toMatchObject({
      category: "other",
      expectMinutes: 20,
      label: "Пошел в ЦСС",
    });
    await expect(world.actions.startTyped("  ")).resolves.toEqual({
      error: "action/empty-text",
      ok: false,
    });
  });

  it("starts the calendar's event from its start, expected until its end", async () => {
    const world = await setupActions();
    unwrap(
      await world.actions.startCalendar({
        endAt: later(60),
        startAt: later(-30),
        title: "Алгебра, лекция",
      }),
    );
    const bar = timeBarModel(world.state.store.getState(), ctx(later(1)));
    expect(bar.running).toMatchObject({
      expectMinutes: 90,
      label: "Алгебра, лекция",
      minutes: 31,
      startAt: later(-30),
    });
    expect(bar.buttons.find((button) => button.isRunning)?.id).toBe("calendar");
  });

  it("attends a calendar event late without hiding it behind what was started meanwhile", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("rest"));
    world.setNow(later(10));
    unwrap(
      await world.actions.startCalendar({
        endAt: later(60),
        startAt: later(-10),
        title: "Seminar",
      }),
    );
    const bar = timeBarModel(world.state.store.getState(), ctx(later(11)));
    expect(bar.running).toMatchObject({ label: "Seminar", startAt: NOW });
    expect(bar.alongside).toEqual([]);
    const open = Object.values(world.state.store.getState().time.activities).filter(
      (activity) => activity.endAt === null,
    );
    expect(open.map((activity) => activity.label)).toEqual(["Seminar"]);
  });

  it("keeps a typed activity within the limits: 80 characters, a day at most", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startTyped(`${"чтение ".repeat(20)}30 ч`));
    const running = timeBarModel(world.state.store.getState(), ctx(later(1))).running;
    expect(running?.label.length).toBeLessThanOrEqual(80);
    expect(running?.expectMinutes).toBe(24 * 60);
  });

  it("stops at a past instant, and the assistant's reading relabels the running one", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startTyped("цсс"));
    const id = timeBarModel(world.state.store.getState(), ctx(later(1))).running?.activityId ?? "";
    unwrap(
      await world.actions.relabelActivity(id, {
        category: "sport",
        expectMinutes: 90,
        label: "ЦСС",
      }),
    );
    world.setNow(later(90));
    unwrap(await world.actions.stopActivity({ at: later(60) }));
    const after = dayModel(world.state.store.getState(), null, ctx(later(95)));
    expect(after.entries.find((entry) => entry.kind === "activity")).toMatchObject({
      row: { category: "sport", expectMinutes: 90, isRunning: false, label: "ЦСС", minutes: 60 },
    });
  });

  it("takes the assistant's reading of a typed activity unless it was renamed meanwhile", async () => {
    const world = await setupActions();
    const typed = "Пошел в ЦСС, 20мин";
    unwrap(await world.actions.startTyped(typed));
    const running = () => timeBarModel(world.state.store.getState(), ctx(later(1))).running;
    const id = running()?.activityId ?? "";
    const reading = { category: "sport" as const, expectMinutes: 90, label: "ЦСС", typed };
    unwrap(await world.actions.refineActivity(id, reading));
    expect(running()).toMatchObject({ category: "sport", expectMinutes: 90, label: "ЦСС" });
    // Renamed by the person (here: by the first reading): a late reading changes nothing.
    expect(
      unwrap(await world.actions.refineActivity(id, { ...reading, label: "Бассейн" })),
    ).toEqual([]);
    expect(running()).toMatchObject({ label: "ЦСС" });
  });

  it("picks a paused task up again when focusing on it", async () => {
    const world = await setupActions();
    const task = Object.values(world.state.store.getState().tasks.byId).find(
      (candidate) => candidate.title === "Algebra HW 6",
    );
    const taskId = task?.id ?? "";
    unwrap(await world.actions.setStatus(taskId, "paused"));
    const isPaused = () =>
      nowViewModel(world.state.store.getState(), ctx(later(1)))
        .rows.find((candidate) => candidate.id === taskId)
        ?.meta.some((part) => part.kind === "paused");
    // A paused task is marked on Now; Focus picks it up again.
    expect(isPaused()).toBe(true);
    unwrap(await world.actions.focusTask(taskId));
    expect(world.state.store.getState().tasks.byId[taskId]?.status).toBe("in_progress");
    expect(isPaused()).toBe(false);
  });

  it("leaves a day with nothing on it empty instead of one long gap", async () => {
    const world = await setupActions();
    expect(dayModel(world.state.store.getState(), null, ctx(NOW)).entries).toEqual([]);
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
