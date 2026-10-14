import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { activityLabel } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { dayModel } from "../view-models/day.ts";
import { insightsModel } from "../view-models/insights.ts";
import { nowViewModel } from "../view-models/now.ts";
import { timeBarModel } from "../view-models/time-bar.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const later = (minutes: number): string =>
  new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const ctx = (now: string) => ({ deviceTz: "Europe/Moscow", now });

/**
Attends an event `startSeconds` from now lasting `lengthSeconds`, with something running for
`runningFor` seconds before (or nothing): whether it started, at now or before, unrefused.
*/
const isAttendedNow = async ([startSeconds, lengthSeconds, runningFor]: readonly [
  number,
  number,
  null | number,
]): Promise<boolean> => {
  const world = await setupActions([]);
  const now = Date.parse(NOW);
  if (runningFor !== null) {
    world.setNow(new Date(now - runningFor * 1000).toISOString());
    unwrap(await world.actions.startTyped("Reading"));
    world.setNow(NOW);
  }
  const startAt = new Date(now + startSeconds * 1000).toISOString();
  const endAt = new Date(now + (startSeconds + lengthSeconds) * 1000).toISOString();
  const result = await world.actions.startCalendar({ endAt, startAt, title: "Коллоквиум" });
  const attended = Object.values(world.state.store.getState().time.activities).find(
    (activity) => activity.label === "Коллоквиум",
  );
  return result.ok && attended !== undefined && Date.parse(attended.startAt) <= now;
};

describe("time actions", () => {
  it("switches with one pick; the running choice picked again keeps running (Stop stops it)", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("rest:workout"));
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

    world.setNow(later(85));
    // Picked again: nothing new, the same block runs on.
    expect(unwrap(await world.actions.startChoice("chores:eating"))).toEqual([]);
    const again = timeBarModel(world.state.store.getState(), ctx(later(86)));
    expect(again.running).toMatchObject({ label: "Eating", minutes: 36 });
    world.setNow(later(90));
    unwrap(await world.actions.stopActivity());
    const after = world.state.store.getState();
    const at = ctx(later(95));
    expect(timeBarModel(after, at).running).toBeNull();
    const day = dayModel(after, null, at);
    const rowOf = (entry: (typeof day.entries)[number]) =>
      entry.kind === "activity" ? [[entry.row.label, entry.row.minutes]] : [];
    expect(day.entries.flatMap((entry) => rowOf(entry))).toEqual([
      ["Workout", 50],
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

  it("refuses a block that ends or starts after now: the past is logged, not the future", async () => {
    const world = await setupActions();
    await expect(
      world.actions.logPast({
        category: "rest",
        endAt: later(60),
        label: "Later",
        startAt: later(-60),
      }),
    ).resolves.toEqual({ error: "retro/future", ok: false });
    const [event] = unwrap(
      await world.actions.logPast({
        category: "rest",
        endAt: later(-30),
        label: "Nap",
        startAt: later(-90),
      }),
    );
    const activityId = event?.type === "activity.logged" ? event.payload.activityId : "";
    await expect(world.actions.adjustActivity(activityId, { endAt: later(30) })).resolves.toEqual({
      error: "retro/future",
      ok: false,
    });
  });

  it("deletes a started block without bringing back the one it had ended", async () => {
    const world = await setupActions();
    const [work] = unwrap(await world.actions.startChoice("rest"));
    world.setNow(later(60));
    const [lunch] = unwrap(await world.actions.startChoice("chores:eating"));
    world.setNow(later(90));
    unwrap(await world.actions.stopActivity());
    const workId = work?.type === "activity.started" ? work.payload.activityId : "";
    const lunchId = lunch?.type === "activity.started" ? lunch.payload.activityId : "";
    unwrap(await world.actions.deleteActivity(lunchId));
    const { activities } = world.state.store.getState().time;
    expect(activities[lunchId]).toBeUndefined();
    expect(activities[workId]).toMatchObject({ endAt: later(60) });
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

  it("logs a past block with a long title cut to the stored label length", async () => {
    const world = await setupActions();
    const title = `Seminar ${"x".repeat(100)}`;
    const [event] = unwrap(
      await world.actions.logPast({
        category: "study",
        endAt: later(-60),
        label: title,
        startAt: later(-120),
      }),
    );
    expect(event?.type === "activity.logged" && event.payload.label).toBe(activityLabel(title));
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

  it("focuses a task alongside what runs, from the Task picker's switch", async () => {
    const world = await setupActions();
    const taskId =
      Object.values(world.state.store.getState().tasks.byId).find(
        (task) => task.title === "Algebra HW 6",
      )?.id ?? "";
    unwrap(await world.actions.startChoice("chores:commute"));
    unwrap(await world.actions.focusTask(taskId, { alongside: true }));
    const bar = timeBarModel(world.state.store.getState(), ctx(later(1)));
    expect(bar.running).toMatchObject({ label: "Commute" });
    expect(bar.alongside).toEqual([expect.objectContaining({ label: "Algebra HW 6", taskId })]);
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

  it.each([
    ["10 minutes ago", -10 * 60_000],
    ["1 second ago", -1000],
    ["right now", 0],
    ["in 1 second", 1000],
    ["in 2 minutes", 2 * 60_000],
    ["in 15 minutes", 15 * 60_000],
  ])("attends an event starting %s: never before its start, never in the future", async (_, ms) => {
    const world = await setupActions();
    const startAt = new Date(Date.parse(NOW) + ms).toISOString();
    const endAt = new Date(Date.parse(startAt) + 60 * 60_000).toISOString();
    unwrap(await world.actions.startCalendar({ endAt, startAt, title: "Colloquium" }));
    const running = timeBarModel(world.state.store.getState(), ctx(NOW)).running;
    // Started: at the event's start once that has passed, else now.
    expect(running).toMatchObject({ label: "Colloquium", startAt: ms < 0 ? startAt : NOW });
    // Expected to last until the event's end, wherever it began.
    const expected = Math.round((Date.parse(endAt) - Date.parse(running?.startAt ?? NOW)) / 60_000);
    expect(running?.expectMinutes).toBe(expected);
  });

  it("attending the same event again keeps it running: a second tap does not start it over", async () => {
    const world = await setupActions();
    const event = { endAt: later(60), startAt: later(5), title: "Colloquium" };
    unwrap(await world.actions.startCalendar(event));
    const first = timeBarModel(world.state.store.getState(), ctx(NOW)).running?.activityId;
    world.setNow(later(1));
    unwrap(await world.actions.startCalendar(event));
    const after = timeBarModel(world.state.store.getState(), ctx(later(1)));
    expect(after.running).toMatchObject({ activityId: first, label: "Colloquium", startAt: NOW });
    const named = Object.values(world.state.store.getState().time.activities).filter(
      (activity) => activity.label === "Colloquium",
    );
    expect(named).toHaveLength(1);
  });

  it("a run of the same title left open since yesterday does not answer today's occurrence", async () => {
    const world = await setupActions([]);
    world.setNow(later(-24 * 60));
    unwrap(
      await world.actions.startCalendar({
        endAt: later(-24 * 60 + 90),
        startAt: later(-24 * 60),
        title: "Colloquium",
      }),
    );
    // Never stopped: still open a day later.
    world.setNow(NOW);
    unwrap(
      await world.actions.startCalendar({
        endAt: later(95),
        startAt: later(5),
        title: "Colloquium",
      }),
    );
    const bar = timeBarModel(world.state.store.getState(), ctx(NOW));
    expect(bar.running).toMatchObject({ label: "Colloquium", startAt: NOW });
    const named = Object.values(world.state.store.getState().time.activities).filter(
      (activity) => activity.label === "Colloquium",
    );
    expect(named).toHaveLength(2);
  });

  it("back-to-back events of one title get a run each", async () => {
    const world = await setupActions([]);
    world.setNow(later(-90));
    unwrap(
      await world.actions.startCalendar({ endAt: NOW, startAt: later(-90), title: "Lecture" }),
    );
    world.setNow(NOW);
    unwrap(await world.actions.startCalendar({ endAt: later(90), startAt: NOW, title: "Lecture" }));
    const runs = Object.values(world.state.store.getState().time.activities)
      .filter((activity) => activity.label === "Lecture")
      .map((activity) => activity.startAt)
      .toSorted((a, b) => a.localeCompare(b));
    expect(runs).toEqual([later(-90), NOW]);
  });

  it("a title over 80 characters is still recognised as attended: a second tap keeps the run", async () => {
    const world = await setupActions([]);
    const event = { endAt: later(60), startAt: later(-5), title: `Lecture ${"x".repeat(100)}` };
    unwrap(await world.actions.startCalendar(event));
    world.setNow(later(1));
    unwrap(await world.actions.startCalendar(event));
    expect(Object.values(world.state.store.getState().time.activities)).toHaveLength(1);
  });

  it("never refuses an event as the future, whatever its offset from now and what runs", async () => {
    // Instants as an Android phone hands them (UTC, ".SSSZ"), seconds around now on either side,
    // with or without something running since before: the attend path must always answer ok.
    const offsets = fc.tuple(
      fc.integer({ max: 6 * 3600, min: -6 * 3600 }),
      fc.integer({ max: 4 * 3600, min: 1 }),
      fc.option(fc.integer({ max: 12 * 3600, min: 0 })),
    );
    await fc.assert(fc.asyncProperty(offsets, isAttendedNow), { numRuns: 150 });
    // The owner's: on for 92 minutes, 93 to go, with something running for 47.
    expect(await isAttendedNow([-92 * 60, 185 * 60, 47 * 60])).toBe(true);
  });

  it("logs a calendar event already over as a closed block and leaves what runs alone", async () => {
    const world = await setupActions();
    unwrap(await world.actions.startChoice("rest"));
    world.setNow(later(70));
    unwrap(
      await world.actions.startCalendar({
        endAt: later(60),
        startAt: later(-30),
        title: "Seminar",
      }),
    );
    const bar = timeBarModel(world.state.store.getState(), ctx(later(71)));
    expect(bar.buttons.find((button) => button.isRunning)?.id).toBe("rest");
    const seminar = Object.values(world.state.store.getState().time.activities).find(
      (activity) => activity.label === "Seminar",
    );
    expect(seminar).toMatchObject({ endAt: later(60), startAt: later(-30) });
  });

  it("starts whatever the time bar's field lets ▶ start: any text that is not blank", async () => {
    // Bug class 1: ▶ is enabled for `text.trim() !== ""`; the action must take every such text.
    const typed = fc
      .string({ maxLength: 200, unit: "grapheme" })
      .filter((text) => text.trim() !== "");
    await fc.assert(
      fc.asyncProperty(typed, async (text) => {
        const world = await setupActions([]);
        return (await world.actions.startTyped(text)).ok;
      }),
      { numRuns: 100 },
    );
    // Spaces round a word, as a field hands them.
    const world = await setupActions([]);
    expect((await world.actions.startTyped("  reading ")).ok).toBe(true);
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
