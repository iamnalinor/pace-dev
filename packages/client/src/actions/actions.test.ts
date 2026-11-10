import { describe, expect, it } from "vitest";

import {
  autoOutcomeId,
  DEFAULT_SETTINGS,
  type Event,
  EXAMPLE_PRESET_IDS,
  isUlid,
  reviewItems,
} from "@pace/core";
import {
  ALGEBRA_ID,
  artboardEvents,
  CALC_HW5_ID,
  CALC_W41_ID,
  ctx,
  HW_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  MOSCOW,
  NOW,
  RFC_ID,
  submitted,
  TRK_ID,
  WORK_ID,
} from "@pace/core/testing";

import { createMemoryEventStore } from "../adapters/memory-event-store.ts";
import { seedSynced } from "../local-store.fake.ts";
import { createAppState } from "../state.ts";
import { repeatChangeProblem } from "../view-models/repeat-change.ts";
import { ESTIMATE_BUCKET_MINUTES } from "./estimate-hints.ts";
import { setupActions, unwrap } from "./fixture.fake.ts";

const HOUR_AGO = "2026-10-06T11:00:00.000Z";

const taskOf = (world: Awaited<ReturnType<typeof setupActions>>, id: string) =>
  world.state.store.getState().tasks.byId[id];

const envelope = (event: Event) => ({
  occurredAt: event.occurredAt,
  precision: event.precision,
  source: event.source,
});

describe("approved assistant actions", () => {
  it("plans against the live state and refuses an unknown task without writing", async () => {
    const world = await setupActions();
    const before = world.state.store.getState().log.length;
    const refused = await world.actions.applyAction({ kind: "task.delete", taskId: "missing" });
    expect(refused).toEqual({ ok: false, error: "action/unknown-task" });
    expect(world.state.store.getState().log).toHaveLength(before);
  });

  it("applies a task close only after approval", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({ presetId: "personal", title: "Review" }),
    );
    expect(created?.type).toBe("task.created");
    if (created?.type !== "task.created") {
      return;
    }
    const result = unwrap(
      await world.actions.applyAction({
        kind: "task.close",
        outcome: "done",
        taskId: created.payload.taskId,
      }),
    );
    expect(result.some((event) => event.type === "task.closed")).toBe(true);
  });
});

describe("createTask", () => {
  it("starts a repeat series from the task's current fields", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({
        description: "Old note",
        dueAt: "2026-10-08T15:00:00.000Z",
        estimateMinutes: 20,
        presetId: "personal",
        startAt: "2026-10-07T15:00:00.000Z",
        title: "Original",
      }),
    );
    if (created?.type !== "task.created") {
      throw new Error("Expected task.created");
    }
    const taskId = created.payload.taskId;
    unwrap(
      await world.actions.updateTask(taskId, {
        description: "Current note",
        dueAt: "2026-10-09T15:00:00.000Z",
        title: "Current title",
      }),
    );
    unwrap(await world.actions.setEstimate(taskId, 45));
    unwrap(await world.actions.setImportance(taskId, "asap"));

    const events = unwrap(await world.actions.startSeriesForTask(taskId, { kind: "daily" }));
    const series = events.find((event) => event.type === "series.created");
    if (series?.type !== "series.created") {
      throw new Error("Expected series.created");
    }
    expect(series.payload.template).toMatchObject({
      description: "Current note",
      dueAt: "2026-10-09T15:00:00.000Z",
      estimateMinutes: 45,
      importance: "asap",
      title: "Current title",
    });
  });

  it("starts a new series for a task whose series was ended, and none while one runs (QA 13 H1)", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.createTask({
        presetId: "personal",
        recurrence: { kind: "weekly" },
        startAt: "2026-10-07T15:00:00.000Z",
        title: "Ser",
      }),
    );
    const first = events.find((event) => event.type === "task.created");
    if (first?.type !== "task.created" || first.payload.seriesId === undefined) {
      throw new Error("Expected the first instance");
    }
    const { seriesId, taskId } = first.payload;
    expect(await world.actions.startSeriesForTask(taskId, { kind: "daily" })).toMatchObject({
      ok: false,
    });
    unwrap(await world.actions.archiveSeries(seriesId, taskId));
    const restarted = unwrap(await world.actions.startSeriesForTask(taskId, { kind: "daily" }));
    const created = restarted.find((event) => event.type === "series.created");
    if (created?.type !== "series.created") {
      throw new Error("Expected series.created");
    }
    expect(created.payload.seriesId).not.toBe(seriesId);
    expect(taskOf(world, taskId)?.seriesId).toBe(created.payload.seriesId);
    expect(world.state.store.getState().series.byId[created.payload.seriesId]?.schedule).toEqual({
      kind: "daily",
    });
  });

  it("refuses a series whose deadline is before its start, as the form does (QA 13 L7)", async () => {
    const world = await setupActions();
    const form = {
      dueAt: "2026-10-01T15:00:00.000Z",
      presetId: "personal",
      startAt: "2026-10-07T15:00:00.000Z",
      title: "Late from birth",
    };
    const before = world.state.store.getState().events.length;
    expect(
      await world.actions.createTask({ ...form, recurrence: { kind: "daily" } }),
    ).toMatchObject({ ok: false });
    expect(world.state.store.getState().events).toHaveLength(before);
    expect(
      repeatChangeProblem(world.state.store.getState(), {
        due: { at: form.dueAt },
        now: { at: form.startAt, tz: "UTC" },
        schedule: { kind: "daily" },
        start: { at: form.startAt, tz: "UTC" },
        taskId: null,
      }),
    ).toBe("repeat/due-before-start");
    // A one-off task already late is written down as it is.
    const [created] = unwrap(await world.actions.createTask(form));
    if (created?.type !== "task.created") {
      throw new Error("Expected task.created");
    }
    expect(
      await world.actions.startSeriesForTask(created.payload.taskId, { kind: "daily" }),
    ).toMatchObject({ ok: false });
  });

  it("creates a repeat series and an independent first task, then keeps one future instance", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.createTask({
        presetId: "personal",
        title: "Take medicine",
        startAt: "2026-10-07T15:00:00.000Z",
        recurrence: { kind: "daily" },
      }),
    );
    expect(events.map((event) => event.type)).toEqual(["series.created", "task.created"]);
    const series = events[0];
    const first = events[1];
    if (series?.type !== "series.created" || first?.type !== "task.created") {
      return;
    }
    expect(first.payload.seriesId).toBe(series.payload.seriesId);
    expect(first.source).toBe("system");
    expect(first.payload.taskId).toMatch(/^rep:/u);
    expect(taskOf(world, first.payload.taskId)?.userModified).toBe(false);
    await world.actions.ensureInstances();
    const generated = Object.values(world.state.store.getState().tasks.byId).filter(
      (task) => task.seriesId === series.payload.seriesId,
    );
    expect(generated).toHaveLength(1);
  });

  it("starts the next instance of a series without a chosen start at the start of its day (QA 14 L10e)", async () => {
    const world = await setupActions();
    // NOW is 15:00 in Moscow; the person chose no start, so 15:00 is nobody's time of day.
    const events = unwrap(
      await world.actions.createTask({
        presetId: "personal",
        recurrence: { kind: "daily" },
        title: "Stretch",
      }),
    );
    const series = events.find((event) => event.type === "series.created");
    const first = events.find((event) => event.type === "task.created");
    if (series?.type !== "series.created" || first?.type !== "task.created") {
      throw new Error("Expected the series and its first instance");
    }
    // The first instance starts when it was made; the series counts from 00:00 that day.
    expect(first.payload.startAt).toBe(NOW);
    expect(series.payload.template.startAt).toBe("2026-10-05T21:00:00.000Z");
    world.setNow("2026-10-06T12:01:00.000Z");
    await world.actions.ensureInstances();
    const starts = Object.values(world.state.store.getState().tasks.byId)
      .filter((task) => task.seriesId === series.payload.seriesId)
      .map((task) => task.startAt ?? "")
      .toSorted((a, b) => a.localeCompare(b));
    // Oct 7 00:00 Moscow, not Oct 7 15:00.
    expect(starts).toEqual([NOW, "2026-10-06T21:00:00.000Z"]);
  });

  it("counts a repeat added to a task without its own start from the start of today", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({ presetId: "personal", title: "Walk" }),
    );
    if (created?.type !== "task.created") {
      throw new Error("Expected task.created");
    }
    const events = unwrap(
      await world.actions.startSeriesForTask(created.payload.taskId, { kind: "monthly" }),
    );
    const series = events.find((event) => event.type === "series.created");
    if (series?.type !== "series.created") {
      throw new Error("Expected series.created");
    }
    expect(series.payload.template.startAt).toBe("2026-10-05T21:00:00.000Z");
    // The task itself still starts when the repeat was added.
    expect(taskOf(world, created.payload.taskId)?.startAt).toBe(NOW);
  });

  it("emits task.created with the client's envelope and fresh ids", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.createTask({
        dueAt: "2026-10-10T12:00:00.000Z",
        estimateMinutes: 90,
        presetId: "hw.algebra",
        projectId: ALGEBRA_ID,
        subtasks: [{ label: "Problem 1", number: 1 }, { label: "Bonus" }],
        title: "Algebra HW 7",
      }),
    );
    expect(events).toHaveLength(1);
    const [created] = events;
    expect(created?.type).toBe("task.created");
    expect(created !== undefined && envelope(created)).toEqual({
      occurredAt: NOW,
      precision: "exact",
      source: "web",
    });
    if (created?.type !== "task.created") {
      return;
    }
    expect(isUlid(created.payload.taskId)).toBe(true);
    expect(created.payload).toMatchObject({
      dueAt: "2026-10-10T12:00:00.000Z",
      dueTz: MOSCOW,
      presetId: "hw.algebra",
      projectId: ALGEBRA_ID,
    });
    expect(created.payload.subtasks.map((item) => item.number)).toEqual([1, undefined]);
    expect(created.payload.subtasks.every((item) => isUlid(item.id))).toBe(true);
    expect(taskOf(world, created.payload.taskId)?.title).toBe("Algebra HW 7");
  });

  it("creates the project on the fly and reuses a namesake whatever its case", async () => {
    const world = await setupActions();
    const fresh = unwrap(
      await world.actions.createTask({ presetId: "work", projectName: "Infra", title: "A" }),
    );
    expect(fresh.map((event) => event.type)).toEqual(["project.created", "task.created"]);
    const projectId = fresh[0]?.type === "project.created" ? fresh[0].payload.projectId : "";
    expect(world.state.store.getState().projects.byId[projectId]?.name).toBe("Infra");
    const reused = unwrap(
      await world.actions.createTask({ presetId: "work", projectName: "  infra ", title: "B" }),
    );
    expect(reused.map((event) => event.type)).toEqual(["task.created"]);
    expect(reused[0]?.type === "task.created" && reused[0].payload.projectId).toBe(projectId);
  });

  it("takes a retro instant with its precision", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createTask({
        at: HOUR_AGO,
        precision: "approx",
        presetId: "personal",
        title: "Water the plants",
      }),
    );
    expect(created !== undefined && envelope(created)).toEqual({
      occurredAt: HOUR_AGO,
      precision: "approx",
      source: "web",
    });
  });

  it("returns the core's validation errors instead of throwing", async () => {
    const world = await setupActions();
    await expect(world.actions.createTask({ presetId: "nope", title: "X" })).resolves.toEqual({
      error: "preset/unknown",
      ok: false,
    });
    await expect(
      world.actions.createTask({ at: "2026-10-06T12:10:00.000Z", presetId: "hw", title: "X" }),
    ).resolves.toEqual({ error: "retro/future", ok: false });
    await expect(
      world.actions.createTask({ presetId: "work", projectId: "p-nope", title: "X" }),
    ).resolves.toEqual({ error: "action/unknown-project", ok: false });
    const snapshot = world.state.store.getState();
    expect(snapshot.events).toHaveLength(snapshot.log.length);
  });
});

describe("captureInbox", () => {
  it("stores the text verbatim as an inbox item", async () => {
    const world = await setupActions();
    const [created] = unwrap(await world.actions.captureInbox("  купить кабель "));
    expect(created?.type === "task.created" && created.payload).toMatchObject({
      importance: "nice_to_have",
      presetId: "inbox",
      sourceText: "  купить кабель ",
      title: "  купить кабель ",
    });
    await expect(world.actions.captureInbox(" ".repeat(3))).resolves.toEqual({
      error: "action/empty-text",
      ok: false,
    });
  });
});

describe("acceptSuggestion", () => {
  it("sets the preset, project, importance and due the suggestion carries", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.acceptSuggestion(INBOX_SYNC_ID, {
        dueAt: "2026-10-09T20:59:00.000Z",
        dueTz: MOSCOW,
        importance: "prioritized",
        presetId: "work",
        projectId: WORK_ID,
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "task.preset.set",
      "task.project.set",
      "task.importance.set",
      "task.updated",
    ]);
    expect(taskOf(world, INBOX_SYNC_ID)).toMatchObject({
      dueAt: "2026-10-09T20:59:00.000Z",
      importance: "prioritized",
      presetId: "work",
      projectId: WORK_ID,
    });
  });

  it("applies the user's overrides on top of the suggestion", async () => {
    const world = await setupActions();
    const events = unwrap(
      await world.actions.acceptSuggestion(
        INBOX_GRADE_ID,
        {
          dueAt: null,
          dueTz: null,
          importance: "nice_to_have",
          presetId: "personal",
          projectId: null,
        },
        { importance: "normal" },
      ),
    );
    expect(events.map((event) => event.type)).toEqual(["task.preset.set", "task.importance.set"]);
    expect(taskOf(world, INBOX_GRADE_ID)?.importance).toBe("normal");
  });
});

describe("discardInbox", () => {
  it("revokes the capture when nothing else happened to it", async () => {
    const world = await setupActions();
    const [revoked] = unwrap(await world.actions.discardInbox(INBOX_SYNC_ID));
    expect(revoked?.type).toBe("event.revoked");
    expect(taskOf(world, INBOX_SYNC_ID)).toBeUndefined();
  });

  it("closes the item as skipped once it has a history", async () => {
    const world = await setupActions();
    unwrap(await world.actions.setImportance(INBOX_GRADE_ID, "normal"));
    const [closed] = unwrap(await world.actions.discardInbox(INBOX_GRADE_ID));
    expect(closed?.type === "task.closed" && closed.payload.outcome).toBe("skipped");
    expect(taskOf(world, INBOX_GRADE_ID)?.closed?.outcome).toBe("skipped");
    await expect(world.actions.discardInbox("t-nope")).resolves.toEqual({
      error: "task/unknown",
      ok: false,
    });
  });
});

describe("deleteTask", () => {
  it("takes the task out of every list, history included, and Undo brings it back", async () => {
    const world = await setupActions();
    unwrap(await world.actions.updateTask(TRK_ID, { title: "Renamed" }));
    const [revoked] = unwrap(await world.actions.deleteTask(TRK_ID));
    expect(revoked?.type).toBe("event.revoked");
    expect(taskOf(world, TRK_ID)).toBeUndefined();
    unwrap(await world.actions.revoke(revoked?.id ?? ""));
    expect(taskOf(world, TRK_ID)?.title).toBe("Renamed");
  });

  it("refuses a task it does not know", async () => {
    const world = await setupActions();
    await expect(world.actions.deleteTask("t-nope")).resolves.toEqual({
      error: "task/unknown",
      ok: false,
    });
  });
});

describe("subtasks", () => {
  it("marks a subtask done at the given instant and unmarks it by revoking", async () => {
    const world = await setupActions();
    const [solved] = unwrap(
      await world.actions.markDone(HW_ID, "s5", { at: HOUR_AGO, precision: "approx" }),
    );
    // The one done mark is the `task.subtask.solved` event, at the instant given (feedback 5).
    expect(solved?.type).toBe("task.subtask.solved");
    expect(solved !== undefined && envelope(solved)).toEqual({
      occurredAt: HOUR_AGO,
      precision: "approx",
      source: "web",
    });
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.doneAt).toBe(HOUR_AGO);
    const [revoked] = unwrap(await world.actions.unmarkDone(HW_ID, "s5"));
    expect(revoked?.type === "event.revoked" && revoked.payload.targetId).toBe(solved?.id);
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.doneAt).toBeNull();
    await expect(world.actions.unmarkDone(HW_ID, "s5")).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    await expect(world.actions.markDone(HW_ID, "s9")).resolves.toEqual({
      error: "subtask/unknown",
      ok: false,
    });
  });

  it("unmarks a subtask an old log also sent: its solve revoked, the send amended to leave it out", async () => {
    const world = await setupActions();
    const doneAt = (id: string) =>
      taskOf(world, HW_ID)?.subtasks.find((item) => item.id === id)?.doneAt ?? null;
    // The fixture's old log: s1 and s2 solved, then sent together in one `task.submitted`.
    expect(doneAt("s1")).not.toBeNull();
    expect(doneAt("s2")).not.toBeNull();
    const written = unwrap(await world.actions.unmarkDone(HW_ID, "s1"));
    expect(written.map((event) => event.type)).toEqual(
      expect.arrayContaining(["event.amended", "event.revoked"]),
    );
    expect(written).toHaveLength(2);
    expect(doneAt("s1")).toBeNull();
    // The other subtask of the same send stays done.
    expect(doneAt("s2")).not.toBeNull();
    // Its only send left: that send is revoked as well.
    unwrap(await world.actions.unmarkDone(HW_ID, "s2"));
    expect(doneAt("s2")).toBeNull();
    await expect(world.actions.unmarkDone(HW_ID, "s2")).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });

  it("refuses to take a mark back on a closed task: an old closing send would reopen it", async () => {
    // An old client's last per-subtask send closed the task (`closes: true`): revoking it to
    // untick the subtask would silently reopen the task (session review #3).
    const closingSend = submitted(990, "2026-10-06T10:00:00.000Z", {
      subtaskIds: ["s5"],
      closes: true,
    });
    const world = await setupActions([...artboardEvents(), closingSend]);
    expect(taskOf(world, HW_ID)?.closed).not.toBeNull();
    const before = world.state.store.getState().log.length;
    await expect(world.actions.unmarkDone(HW_ID, "s5")).resolves.toEqual({
      error: "retro/task-closed",
      ok: false,
    });
    expect(world.state.store.getState().log).toHaveLength(before);
    expect(taskOf(world, HW_ID)?.closed).not.toBeNull();
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.doneAt).not.toBeNull();
  });

  it("refuses to take a mark back on a task closed while the history was loading (class 118)", async () => {
    const world = await setupActions();
    unwrap(await world.actions.markDone(HW_ID, "s5"));
    world.state.setHistoryLoader(async () => {
      // The seconds a hydration takes: the task is closed meanwhile (another tab, the sync).
      unwrap(await world.actions.closeTask({ outcome: "done", taskId: HW_ID }));
      return { ok: true, value: undefined };
    });
    const before = world.state.store.getState().log.length;
    await expect(world.actions.unmarkDone(HW_ID, "s5")).resolves.toEqual({
      error: "retro/task-closed",
      ok: false,
    });
    expect(world.state.store.getState().log).toHaveLength(before + 1);
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.doneAt).not.toBeNull();
  });

  it("adds subtasks with fresh ids", async () => {
    const world = await setupActions();
    const [added] = unwrap(
      await world.actions.addSubtasks(HW_ID, ["Problem 8", { label: "Problem 9", number: 9 }]),
    );
    expect(added?.type === "task.subtasks.added" && added.payload.subtasks).toMatchObject([
      { label: "Problem 8" },
      { label: "Problem 9", number: 9 },
    ]);
    expect(taskOf(world, HW_ID)?.subtasks).toHaveLength(9);
    await expect(world.actions.addSubtasks(HW_ID, [])).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });
});

describe("removing a subtask", () => {
  it("takes a subtask off the task, a done one too; an unknown one is refused", async () => {
    const world = await setupActions();
    const [removed] = unwrap(await world.actions.removeSubtask(HW_ID, "s7"));
    expect(removed?.type).toBe("task.subtask.removed");
    expect(taskOf(world, HW_ID)?.subtasks.map((item) => item.id)).not.toContain("s7");
    await expect(world.actions.removeSubtask(HW_ID, "s7")).resolves.toEqual({
      error: "subtask/unknown",
      ok: false,
    });
    unwrap(await world.actions.removeSubtask(HW_ID, "s1"));
    expect(taskOf(world, HW_ID)?.subtasks.map((item) => item.id)).not.toContain("s1");
  });
});

describe("closing and reopening", () => {
  it("closes once when tapped twice at the same moment", async () => {
    const world = await setupActions();
    const closes = await Promise.all([
      world.actions.closeTask({ outcome: "done", taskId: TRK_ID }),
      world.actions.closeTask({ outcome: "done", taskId: TRK_ID }),
    ]);
    expect(closes.map((result) => result.ok)).toEqual([true, false]);
  });

  it("closes with an outcome and a reason, then reopens", async () => {
    const world = await setupActions();
    const [closed] = unwrap(
      await world.actions.closeTask({ outcome: "cancelled", reason: "moved", taskId: RFC_ID }),
    );
    expect(closed?.type === "task.closed" && closed.payload).toEqual({
      outcome: "cancelled",
      reason: "moved",
      taskId: RFC_ID,
    });
    await expect(world.actions.markDone(RFC_ID, "x")).resolves.toEqual({
      error: "retro/task-closed",
      ok: false,
    });
    unwrap(await world.actions.reopen(RFC_ID));
    expect(taskOf(world, RFC_ID)?.closed).toBeNull();
    await expect(world.actions.reopen(RFC_ID)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });
});

describe("task fields", () => {
  it("sets status, importance, progress, estimate, preset and overrides", async () => {
    const world = await setupActions();
    unwrap(await world.actions.setStatus(TRK_ID, "paused"));
    // TRK-231 is re-prioritized on Wednesday in the fixture, which would outrank an instant of today.
    unwrap(await world.actions.setImportance(RFC_ID, "asap"));
    unwrap(await world.actions.setProgress(TRK_ID, 7));
    unwrap(await world.actions.setEstimate(TRK_ID, null));
    unwrap(await world.actions.setPreset(TRK_ID, "personal"));
    unwrap(await world.actions.setOverrides(TRK_ID, { defaultEstimateMinutes: 45 }));
    expect(taskOf(world, TRK_ID)).toMatchObject({
      estimateMinutes: null,
      overrides: { defaultEstimateMinutes: 45 },
      presetId: "personal",
      slider: 7,
      status: "paused",
    });
    expect(taskOf(world, RFC_ID)?.importance).toBe("asap");
    await expect(world.actions.setProgress(TRK_ID, 11)).resolves.toEqual({
      error: "action/invalid-input",
      ok: false,
    });
    await expect(world.actions.setOverrides(TRK_ID, { progressMode: "nope" })).resolves.toEqual({
      error: "preset/invalid-overrides",
      ok: false,
    });
    await expect(world.actions.setPreset(TRK_ID, "nope")).resolves.toEqual({
      error: "preset/unknown",
      ok: false,
    });
  });

  it("updates the editable fields and defaults the zone of a new due", async () => {
    const world = await setupActions();
    const [updated] = unwrap(
      await world.actions.updateTask(TRK_ID, {
        description: null,
        dueAt: "2026-10-12T15:00:00.000Z",
        fields: { link: "https://tracker.example.com/TRK-232" },
        title: "Flaky test",
      }),
    );
    expect(updated?.type === "task.updated" && updated.payload).toEqual({
      description: null,
      dueAt: "2026-10-12T15:00:00.000Z",
      dueTz: MOSCOW,
      fields: { link: "https://tracker.example.com/TRK-232" },
      taskId: TRK_ID,
      title: "Flaky test",
    });
    await expect(world.actions.updateTask(TRK_ID, {})).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });

  it("moves a task between projects by id, by name or out of any", async () => {
    const world = await setupActions();
    unwrap(await world.actions.setProject(TRK_ID, { projectId: ALGEBRA_ID }));
    expect(taskOf(world, TRK_ID)?.projectId).toBe(ALGEBRA_ID);
    const byName = unwrap(await world.actions.setProject(TRK_ID, { projectName: "Side" }));
    expect(byName.map((event) => event.type)).toEqual(["project.created", "task.project.set"]);
    unwrap(await world.actions.setProject(TRK_ID, null));
    expect(taskOf(world, TRK_ID)?.projectId).toBeNull();
    await expect(world.actions.setProject(TRK_ID, { projectId: "p-nope" })).resolves.toEqual({
      error: "action/unknown-project",
      ok: false,
    });
  });
});

describe("presets", () => {
  const definition = { defaultImportance: "prioritized" } as const;

  it("creates, updates and archives a user preset after validating it", async () => {
    const world = await setupActions();
    const [created] = unwrap(
      await world.actions.createPreset({
        definition,
        extends: "hw",
        id: "hw.physics",
        name: "Physics",
      }),
    );
    expect(created?.type === "preset.created" && created.payload).toEqual({
      definition,
      extends: "hw",
      id: "hw.physics",
      name: "Physics",
    });
    unwrap(
      await world.actions.updatePreset({
        definition: {},
        extends: "work",
        id: "hw.physics",
        name: "Physics lab",
      }),
    );
    expect(world.state.store.getState().presets.byId["hw.physics"]).toMatchObject({
      definition: {},
      extends: "work",
      name: "Physics lab",
    });
    unwrap(await world.actions.archivePreset("hw.physics"));
    expect(world.state.store.getState().presets.byId["hw.physics"]?.archived).toBe(true);
    await expect(world.actions.archivePreset("hw.physics")).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    // Restore revokes the archive (QA round 25 R25-02): a correction, the archive stays in the log.
    const restored = unwrap(await world.actions.restorePreset("hw.physics"));
    expect(restored.map((event) => event.type)).toEqual(["event.revoked"]);
    expect(world.state.store.getState().presets.byId["hw.physics"]?.archived).toBe(false);
    await expect(world.actions.restorePreset("hw.physics")).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    await expect(world.actions.restorePreset("nope")).resolves.toEqual({
      error: "preset/unknown",
      ok: false,
    });
    // Deleted again and restored again: the newest archive is the one revoked.
    unwrap(await world.actions.archivePreset("hw.physics"));
    unwrap(await world.actions.restorePreset("hw.physics"));
    expect(world.state.store.getState().presets.byId["hw.physics"]?.archived).toBe(false);
  });

  it("restores a preset two devices archived offline in one press, one batch (review M1)", async () => {
    const store = createMemoryEventStore();
    const world = await setupActions(undefined, store);
    const [archive] = unwrap(await world.actions.archivePreset("hw.algebra"));
    if (archive === undefined) {
      throw new Error("archived");
    }
    // The other device's archive of the same preset, synced in.
    await seedSynced(store, [{ ...archive, deviceId: "phone", id: "01KOTHERDEVICEARCHIVE00000" }]);
    await world.state.rematerialize();
    const restored = unwrap(await world.actions.restorePreset("hw.algebra"));
    expect(restored.map((event) => event.type)).toEqual(["event.revoked", "event.revoked"]);
    // One action: the revocations share their instants.
    expect(new Set(restored.map((event) => `${event.occurredAt}${event.recordedAt}`)).size).toBe(1);
    expect(world.state.store.getState().presets.byId["hw.algebra"]?.archived).toBe(false);
  });

  it("refuses to revoke an event revoked already, and revokes a set all or none (review M2)", async () => {
    const world = await setupActions();
    const [archive] = unwrap(await world.actions.archivePreset("hw.algebra"));
    const [moved] = unwrap(await world.actions.archivePreset("work"));
    if (archive === undefined || moved === undefined) {
      throw new Error("archived");
    }
    unwrap(await world.actions.revoke(archive.id));
    const logLength = world.state.store.getState().log.length;
    await expect(world.actions.revoke(archive.id)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    // One of the set revoked already: nothing of it is written.
    await expect(world.actions.revokeAll([moved.id, archive.id])).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    expect(world.state.store.getState().log).toHaveLength(logLength);
    expect(world.state.store.getState().presets.byId["work"]?.archived).toBe(true);
  });

  it("writes one revocation when two revokes of the same event run at once (review I4)", async () => {
    const world = await setupActions();
    const [archive] = unwrap(await world.actions.archivePreset("hw.algebra"));
    const [moved] = unwrap(await world.actions.archivePreset("work"));
    if (archive === undefined || moved === undefined) {
      throw new Error("archived");
    }
    // A double press on History's Undo, or a toast's Undo racing History's: both in one tick.
    const results = await Promise.all([
      world.actions.revoke(archive.id),
      world.actions.revoke(archive.id),
      world.actions.revokeAll([moved.id, archive.id]),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false, false]);
    const revocations = world.state.store
      .getState()
      .log.filter((event) => event.type === "event.revoked");
    expect(revocations.map((event) => event.payload.targetId)).toEqual([archive.id]);
    // So one Undo of the Undo puts the archive back in force.
    unwrap(await world.actions.revoke(revocations[0]?.id ?? ""));
    expect(world.state.store.getState().presets.byId["hw.algebra"]?.archived).toBe(true);
  });

  it("returns the preset validation errors", async () => {
    const world = await setupActions();
    await expect(
      world.actions.createPreset({ definition, extends: "hw", id: "hw.algebra", name: "Dup" }),
    ).resolves.toEqual({ error: "preset/exists", ok: false });
    await expect(
      world.actions.updatePreset({ definition, extends: "hw", id: "hw.nope", name: "X" }),
    ).resolves.toEqual({ error: "preset/unknown", ok: false });
    await expect(world.actions.archivePreset("inbox")).resolves.toEqual({
      error: "preset/built-in",
      ok: false,
    });
    await expect(world.actions.archivePreset("nope")).resolves.toEqual({
      error: "preset/unknown",
      ok: false,
    });
  });

  it("seeds the example course presets once", async () => {
    const world = await setupActions([]);
    const seeded = unwrap(await world.actions.seedExamplePresets());
    expect(seeded.map((event) => event.type === "preset.created" && event.payload.id)).toEqual([
      ...EXAMPLE_PRESET_IDS,
    ]);
    expect(seeded.every((event) => event.source === "web")).toBe(true);
    await expect(world.actions.seedExamplePresets()).resolves.toEqual({ ok: true, value: [] });
  });

  it("seeds the examples in the account's language (QA round 23 R23-06)", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.setLanguage("ru"));
    const seeded = unwrap(await world.actions.seedExamplePresets());
    expect(
      seeded.map((event) => (event.type === "preset.created" ? event.payload.name : null)),
    ).toEqual(["ДЗ по алгебре", "ДЗ по матанализу", "ДЗ по истории"]);
  });

  it("leaves out an example whose name a preset already goes by (review M6)", async () => {
    const world = await setupActions([]);
    unwrap(
      await world.actions.createPreset({
        definition: {},
        extends: "hw",
        id: "mine",
        name: "algebra hw",
      }),
    );
    const seeded = unwrap(await world.actions.seedExamplePresets());
    expect(seeded.map((event) => event.type === "preset.created" && event.payload.id)).toEqual(
      EXAMPLE_PRESET_IDS.filter((id) => id !== "hw.algebra"),
    );
  });

  it("moves a preset one place in the picker order, renumbering only what changed", async () => {
    const world = await setupActions([]);
    const order = () =>
      Object.values(world.state.store.getState().presets.byId)
        .filter((preset) => preset.id !== "inbox")
        .toSorted((a, b) => a.order - b.order)
        .map((preset) => preset.id);
    expect(order()).toEqual(["hw", "work", "personal", "deferred"]);
    const moved = unwrap(await world.actions.movePreset("personal", -1));
    expect(moved.map((event) => event.type === "preset.updated" && event.payload)).toEqual([
      { id: "personal", order: 2 },
      { id: "work", order: 3 },
    ]);
    expect(order()).toEqual(["hw", "personal", "work", "deferred"]);
    await expect(world.actions.movePreset("hw", -1)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    await expect(world.actions.movePreset("nope", 1)).resolves.toEqual({
      error: "preset/unknown",
      ok: false,
    });
  });

  it("moves a new preset among the defaults, whose order it shares with other new ones", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.createPreset({ definition: {}, extends: "hw", id: "b", name: "B" }));
    unwrap(await world.actions.createPreset({ definition: {}, extends: "hw", id: "a", name: "A" }));
    unwrap(await world.actions.movePreset("b", -1));
    const ids = Object.values(world.state.store.getState().presets.byId)
      .filter((preset) => preset.id !== "inbox")
      .toSorted((x, y) => x.order - y.order)
      .map((preset) => preset.id);
    expect(ids).toEqual(["hw", "work", "personal", "deferred", "b", "a"]);
  });

  it("offers the plan's estimate buckets until stage 3 fills them", async () => {
    const world = await setupActions([]);
    expect(world.actions.estimateHints("hw")).toEqual(
      ESTIMATE_BUCKET_MINUTES.map((minutes) => ({ minutes, samples: [] })),
    );
  });
});

describe("a state check inside the write queue (class 222 sweep)", () => {
  it("writes one event for two presses at once: preset delete, reopen, project archive", async () => {
    const world = await setupActions([]);
    const archives = await Promise.all([
      world.actions.archivePreset("deferred"),
      world.actions.archivePreset("deferred"),
    ]);
    expect(archives.map((result) => result.ok)).toEqual([true, false]);
    const [created] = unwrap(
      await world.actions.createTask({ presetId: "personal", title: "Twice" }),
    );
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    unwrap(await world.actions.closeTask({ outcome: "done", taskId }));
    const reopens = await Promise.all([world.actions.reopen(taskId), world.actions.reopen(taskId)]);
    expect(reopens.map((result) => result.ok)).toEqual([true, false]);
    const [project] = unwrap(await world.actions.createProject({ color: "blue", name: "Infra" }));
    const projectId = project?.type === "project.created" ? project.payload.projectId : "";
    const projectArchives = await Promise.all([
      world.actions.updateProject(projectId, { archived: true }),
      world.actions.updateProject(projectId, { archived: true }),
    ]);
    expect(projectArchives.map((result) => result.ok)).toEqual([true, false]);
  });
});

describe("projects", () => {
  it("creates a project with a trimmed name and edits, archives and restores it", async () => {
    const world = await setupActions([]);
    const [created] = unwrap(await world.actions.createProject({ color: "blue", name: " Infra " }));
    const projectId = created?.type === "project.created" ? created.payload.projectId : "";
    expect(created?.type === "project.created" && created.payload).toEqual({
      color: "blue",
      name: "Infra",
      projectId,
    });
    unwrap(
      await world.actions.updateProject(projectId, {
        color: "coral",
        description: "  ",
        name: "Ops",
      }),
    );
    expect(world.state.store.getState().projects.byId[projectId]).toMatchObject({
      color: "coral",
      description: null,
      name: "Ops",
    });
    unwrap(await world.actions.updateProject(projectId, { archived: true }));
    expect(world.state.store.getState().projects.byId[projectId]?.archived).toBe(true);
  });

  it("undoes an archive only while it is the archive in effect (QA round 28 R28-02)", async () => {
    const world = await setupActions([]);
    const [created] = unwrap(await world.actions.createProject({ color: "blue", name: "Infra" }));
    const projectId = created?.type === "project.created" ? created.payload.projectId : "";
    const [archived] = unwrap(await world.actions.updateProject(projectId, { archived: true }));
    const archiveId = archived?.id ?? "";
    const logLength = () => world.state.store.getState().log.length;
    // Restored from its page: the toast's Undo writes nothing.
    unwrap(await world.actions.updateProject(projectId, { archived: false }));
    const before = logLength();
    await expect(world.actions.undoArchive(projectId, archiveId)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    expect(logLength()).toBe(before);
    // Archived again: the old toast's Undo is not this archive's.
    const [again] = unwrap(await world.actions.updateProject(projectId, { archived: true }));
    await expect(world.actions.undoArchive(projectId, archiveId)).resolves.toMatchObject({
      ok: false,
    });
    // Its own Undo, pressed twice at once, writes one revocation.
    const results = await Promise.all([
      world.actions.undoArchive(projectId, again?.id ?? ""),
      world.actions.undoArchive(projectId, again?.id ?? ""),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(world.state.store.getState().projects.byId[projectId]?.archived).toBe(false);
  });

  it("refuses an empty name and one another active project carries", async () => {
    const world = await setupActions([]);
    const [created] = unwrap(await world.actions.createProject({ color: "blue", name: "Infra" }));
    const projectId = created?.type === "project.created" ? created.payload.projectId : "";
    await expect(world.actions.createProject({ color: "coral", name: "  " })).resolves.toEqual({
      error: "project/name-required",
      ok: false,
    });
    await expect(world.actions.createProject({ color: "coral", name: "infra" })).resolves.toEqual({
      error: "project/name-taken",
      ok: false,
    });
    unwrap(await world.actions.updateProject(projectId, { name: " INFRA " }));
    await expect(world.actions.updateProject("p-nope", { name: "X" })).resolves.toEqual({
      error: "action/unknown-project",
      ok: false,
    });
  });
});

describe("ensureInstances", () => {
  it("adds the missing instances and automatic outcomes as system events, once", async () => {
    const world = await setupActions();
    // Past its final deadline, Calculus HW 5 stays open and overdue: nothing closes it (feedback 5).
    await expect(world.actions.ensureInstances()).resolves.toBe(0);
    const missed = world.state.store
      .getState()
      .log.find((event) => event.id === autoOutcomeId(CALC_HW5_ID, "missed"));
    expect(missed).toBeUndefined();
    expect(taskOf(world, CALC_HW5_ID)?.closed).toBeNull();

    world.setNow("2026-10-13T12:00:00.000Z");
    // Week 42's two issued instances, History's next one ahead, the skip of its empty week 40.
    await expect(world.actions.ensureInstances()).resolves.toBe(4);
    const log = world.state.store.getState().log;
    for (const id of ["hw:hw.algebra:2026-W42", "hw:hw.calculus:2026-W42"]) {
      expect(log.find((event) => event.id === id)).toMatchObject({ source: "system" });
    }
    expect(taskOf(world, "hw:hw.algebra:2026-W42")?.title).toBe("Algebra HW 2");
    expect(taskOf(world, TRK_ID)?.closed).toBeNull();
    await expect(world.actions.ensureInstances()).resolves.toBe(0);
  });

  it("does not recreate an instance whose creation was revoked", async () => {
    const world = await setupActions();
    // System-made instances share their id with their creation event.
    unwrap(await world.actions.revoke(CALC_W41_ID));
    expect(taskOf(world, CALC_W41_ID)).toBeUndefined();
    // Nothing: the overdue HW 5 is still open, so the next week is not put ahead (feedback 5).
    await expect(world.actions.ensureInstances()).resolves.toBe(0);
    expect(taskOf(world, CALC_W41_ID)).toBeUndefined();
    expect(taskOf(world, CALC_HW5_ID)?.closed).toBeNull();
  });
});

describe("review", () => {
  it("runs a review action with the client's source", async () => {
    const world = await setupActions();
    const item = reviewItems(world.state.store.getState(), ctx()).find(
      (entry) => entry.taskId === CALC_HW5_ID,
    );
    if (item === undefined) {
      throw new Error("no review item");
    }
    const [closed] = unwrap(await world.actions.runReviewAction(item, "mark-done"));
    expect(closed).toMatchObject({ source: "web", type: "task.closed" });
    expect(world.rematerializeCalls()).toBe(0);
    // Keep open answers the card with the task's own status again (see the core's review); on a
    // task closed meanwhile there is nothing to keep open.
    await expect(world.actions.runReviewAction(item, "keep-open")).resolves.toEqual({
      error: "retro/task-closed",
      ok: false,
    });
    const fresh = await setupActions();
    const [kept] = unwrap(await fresh.actions.runReviewAction(item, "keep-open"));
    expect(kept).toMatchObject({ source: "web", type: "task.status.set" });
    await expect(world.actions.runReviewAction(item, "undo")).resolves.toEqual({
      error: "action/unknown-review-action",
      ok: false,
    });
  });

  it("shows a correction without a second rebuild and confirms or undoes automatic outcomes", async () => {
    const store = createMemoryEventStore();
    // An automatic miss an older version wrote: none is made any more (feedback 5).
    const at = new Date(Date.parse(NOW) - 60 * 60 * 1000).toISOString();
    const oldMiss: Event = {
      deviceId: "server",
      id: autoOutcomeId(CALC_HW5_ID, "missed"),
      occurredAt: at,
      payload: { outcome: "cancelled_missed", taskId: CALC_HW5_ID },
      precision: "exact",
      recordedAt: at,
      source: "system",
      type: "task.closed",
    };
    const world = await setupActions([...artboardEvents(), oldMiss], store);
    await world.actions.ensureInstances();
    const item = reviewItems(world.state.store.getState(), ctx()).find(
      (entry) => entry.kind === "confirm-auto-outcome",
    );
    if (item === undefined) {
      throw new Error("no review item");
    }
    unwrap(await world.actions.runReviewAction(item, "confirm"));
    // The store's integrate rebuilt on the correction already: no re-read of the whole log, and
    // the state is what a fresh read of the disk derives (class 55 / 108).
    expect(world.rematerializeCalls()).toBe(0);
    expect(taskOf(world, CALC_HW5_ID)?.closed?.confirmed).toBe(true);
    const fresh = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    await fresh.ready;
    const { version: _shown, ...shown } = world.state.store.getState();
    const { version: _read, ...read } = fresh.store.getState();
    expect(shown).toEqual(read);
    await expect(world.actions.confirmAutoOutcome(CALC_HW5_ID)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    unwrap(await world.actions.undoAutoOutcome(CALC_HW5_ID));
    expect(taskOf(world, CALC_HW5_ID)?.closed).toBeNull();
    // An undone automatic outcome stays undone: the system never proposes it twice.
    await expect(world.actions.ensureInstances()).resolves.toBe(0);
    await expect(world.actions.confirmAutoOutcome(CALC_HW5_ID)).resolves.toEqual({
      error: "action/not-auto-outcome",
      ok: false,
    });
    await expect(world.actions.undoAutoOutcome(TRK_ID)).resolves.toEqual({
      error: "action/not-auto-outcome",
      ok: false,
    });
  });
});

describe("settings", () => {
  it("gives an account without a zone the device zone, once", async () => {
    const world = await setupActions([]);
    expect(unwrap(await world.actions.ensureTimezone())).toHaveLength(1);
    expect(world.state.store.getState().settings.timezone).toBe(MOSCOW);
    expect(unwrap(await world.actions.ensureTimezone())).toHaveLength(0);
  });

  it("updates the account settings", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.setLanguage("ru"));
    unwrap(await world.actions.setTimezone("UTC"));
    unwrap(await world.actions.setDigestWindows(["08:00", "20:00"]));
    unwrap(await world.actions.setQuietHours({ from: "22:00", to: "07:00" }));
    unwrap(await world.actions.setNightHours(true));
    unwrap(await world.actions.setNotificationChannel("deadline_digest", "web", true));
    expect(world.state.store.getState().settings).toEqual({
      categoryEstimates: {},
      digestWindows: ["08:00", "20:00"],
      language: "ru",
      nightHours: true,
      notificationChannels: {
        ...DEFAULT_SETTINGS.notificationChannels,
        deadline_digest: { app: false, telegram: true, web: true },
      },
      quietHours: { from: "22:00", to: "07:00" },
      timezone: "UTC",
    });
    await expect(world.actions.setTimezone("Mars/Olympus")).resolves.toEqual({
      error: "action/invalid-input",
      ok: false,
    });
    await expect(world.actions.setDigestWindows(["8am"])).resolves.toMatchObject({
      error: expect.stringMatching(/^dispatch\//) as string,
      ok: false,
    });
  });

  it("writes one digest time by its row, on the list as it is when the write runs (review I1)", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.setDigestWindows(["09:00", "14:00", "21:00"]));
    const digest = () => world.state.store.getState().settings.digestWindows;
    // The third row removed, then its field's late save of «20:00»: the row stays removed.
    const [removed, late] = await Promise.all([
      world.actions.removeDigestTime(2, "21:00"),
      world.actions.setDigestTime(2, "20:00"),
    ]);
    expect(unwrap(removed)).toHaveLength(1);
    expect(unwrap(late)).toEqual([]);
    expect(digest()).toEqual(["09:00", "14:00"]);
    // An earlier row removed while a later one is saved: the later one lands on its new place.
    await Promise.all([
      world.actions.removeDigestTime(0, "09:00"),
      world.actions.setDigestTime(0, "15:00"),
    ]);
    expect(digest()).toEqual(["15:00"]);
  });

  it("removes a digest time once for two presses of its ✕ (class 222)", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.setDigestWindows(["09:00", "14:00", "21:00"]));
    const results = await Promise.all([
      world.actions.removeDigestTime(1, "14:00"),
      world.actions.removeDigestTime(1, "14:00"),
    ]);
    expect(results.map((result) => unwrap(result).length)).toEqual([1, 0]);
    expect(world.state.store.getState().settings.digestWindows).toEqual(["09:00", "21:00"]);
    // A time the row already holds writes nothing.
    expect(unwrap(await world.actions.setDigestTime(0, "09:00"))).toEqual([]);
  });

  it("stores a manual category estimate as an event and uses it after a specific estimate", async () => {
    const world = await setupActions([]);
    const [setting] = unwrap(await world.actions.setCategoryEstimate("hygiene", 22));
    expect(setting?.type).toBe("settings.updated");
    const [defaulted] = unwrap(
      await world.actions.startActivity({ category: "hygiene", label: "Shower" }),
    );
    expect(defaulted?.type === "activity.started" && defaulted.payload.expectMinutes).toBe(22);
    const [specific] = unwrap(
      await world.actions.startActivity({ category: "hygiene", expectMinutes: 12, label: "Bath" }),
    );
    expect(specific?.type === "activity.started" && specific.payload.expectMinutes).toBe(12);
    unwrap(await world.actions.setCategoryEstimate("hygiene", null));
    expect(world.state.store.getState().settings.categoryEstimates).toEqual({});
  });
});

describe("undo", () => {
  it("revokes by id and undoes the latest own event", async () => {
    const world = await setupActions();
    const [solved] = unwrap(await world.actions.markDone(HW_ID, "s5"));
    const [undone] = unwrap(await world.actions.undoLast());
    expect(undone?.type === "event.revoked" && undone.payload.targetId).toBe(solved?.id);
    await expect(world.actions.revoke("missing")).resolves.toEqual({
      error: "event/not-found",
      ok: false,
    });
    const fresh = await setupActions([]);
    await expect(fresh.actions.undoLast()).resolves.toEqual({ error: "undo/nothing", ok: false });
  });
});
