import { describe, expect, it } from "vitest";

import { autoOutcomeId, type Event, EXAMPLE_PRESET_IDS, isUlid, reviewItems } from "@pace/core";
import {
  ALGEBRA_ID,
  CALC_HW5_ID,
  CALC_W41_ID,
  ctx,
  DEMO_ID,
  HW_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  MOSCOW,
  NOW,
  RFC_ID,
  TRK_ID,
  WORK_ID,
} from "@pace/core/testing";

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

describe("createTask", () => {
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

describe("subtasks", () => {
  it("marks a problem solved at the given instant and unmarks it by revoking", async () => {
    const world = await setupActions();
    const [solved] = unwrap(
      await world.actions.markSolved(HW_ID, "s5", { at: HOUR_AGO, precision: "approx" }),
    );
    expect(solved !== undefined && envelope(solved)).toEqual({
      occurredAt: HOUR_AGO,
      precision: "approx",
      source: "web",
    });
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.solvedAt).toBe(
      HOUR_AGO,
    );
    const [revoked] = unwrap(await world.actions.unmarkSolved(HW_ID, "s5"));
    expect(revoked?.type === "event.revoked" && revoked.payload.targetId).toBe(solved?.id);
    expect(taskOf(world, HW_ID)?.subtasks.find((item) => item.id === "s5")?.solvedAt).toBeNull();
    await expect(world.actions.unmarkSolved(HW_ID, "s5")).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
    await expect(world.actions.markSolved(HW_ID, "s9")).resolves.toEqual({
      error: "subtask/unknown",
      ok: false,
    });
  });

  it("adds problems with fresh ids", async () => {
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

describe("submit", () => {
  it("sends the solved problems by default and closes with the last ones", async () => {
    const world = await setupActions();
    const [partial] = unwrap(await world.actions.submit({ taskId: HW_ID }));
    expect(partial?.type === "task.submitted" && partial.payload).toEqual({
      subtaskIds: ["s3", "s4"],
      taskId: HW_ID,
    });
    expect(taskOf(world, HW_ID)?.closed).toBeNull();
    for (const id of ["s5", "s6", "s7"]) {
      unwrap(await world.actions.markSolved(HW_ID, id));
    }
    const [last] = unwrap(await world.actions.submit({ at: HOUR_AGO, taskId: HW_ID }));
    expect(last?.type === "task.submitted" && last.payload).toEqual({
      closes: true,
      subtaskIds: ["s5", "s6", "s7"],
      taskId: HW_ID,
    });
    expect(taskOf(world, HW_ID)?.closed).toMatchObject({ at: HOUR_AGO, outcome: "done" });
  });

  it("submits a whole task without ids and closes it", async () => {
    const world = await setupActions();
    const [sent] = unwrap(await world.actions.submit({ taskId: TRK_ID }));
    expect(sent?.type === "task.submitted" && sent.payload).toEqual({
      closes: true,
      taskId: TRK_ID,
    });
    expect(taskOf(world, TRK_ID)?.closed?.outcome).toBe("done");
  });

  it("refuses when there is nothing to send", async () => {
    const world = await setupActions();
    await expect(world.actions.submit({ subtaskIds: ["s1"], taskId: HW_ID })).resolves.toEqual({
      error: "retro/nothing-to-submit",
      ok: false,
    });
    await expect(world.actions.submit({ taskId: CALC_HW5_ID })).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });
});

describe("closing and reopening", () => {
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
    await expect(world.actions.markSolved(RFC_ID, "x")).resolves.toEqual({
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
    unwrap(await world.actions.setOverrides(TRK_ID, { urgencyPolicy: "age" }));
    expect(taskOf(world, TRK_ID)).toMatchObject({
      estimateMinutes: null,
      overrides: { urgencyPolicy: "age" },
      presetId: "personal",
      slider: 7,
      status: "paused",
    });
    expect(taskOf(world, RFC_ID)?.importance).toBe("asap");
    await expect(world.actions.setProgress(TRK_ID, 11)).resolves.toEqual({
      error: "action/invalid-input",
      ok: false,
    });
    await expect(world.actions.setOverrides(TRK_ID, { urgencyPolicy: "nope" })).resolves.toEqual({
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
        fields: { ticket: "TRK-232" },
        title: "Flaky test",
      }),
    );
    expect(updated?.type === "task.updated" && updated.payload).toEqual({
      description: null,
      dueAt: "2026-10-12T15:00:00.000Z",
      dueTz: MOSCOW,
      fields: { ticket: "TRK-232" },
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

describe("setRank", () => {
  it("renumbers the open tasks of the category densely from 1", async () => {
    const world = await setupActions();
    const events = unwrap(await world.actions.setRank(RFC_ID, 1));
    const ranks = events.map((event) =>
      event.type === "task.rank.set" ? [event.payload.taskId, event.payload.rank] : [],
    );
    expect(ranks).toEqual([
      [RFC_ID, 1],
      [DEMO_ID, 2],
      [TRK_ID, 3],
    ]);
    await expect(world.actions.setRank(RFC_ID, 1)).resolves.toEqual({ ok: true, value: [] });
  });

  it("ranks the unranked Normal tasks by creation first and clamps the position", async () => {
    const world = await setupActions();
    const events = unwrap(await world.actions.setRank(HW_ID, 99));
    expect(
      events.map((event) =>
        event.type === "task.rank.set" ? [event.payload.taskId, event.payload.rank] : [],
      ),
    ).toEqual([
      [CALC_HW5_ID, 1],
      [HW_ID, 2],
    ]);
    await expect(world.actions.setRank(INBOX_SYNC_ID, 1)).resolves.toEqual({
      error: "action/nothing-to-do",
      ok: false,
    });
  });
});

describe("presets", () => {
  const definition = { urgencyPolicy: "age" } as const;

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
  });

  it("returns the preset validation errors", async () => {
    const world = await setupActions();
    await expect(
      world.actions.createPreset({ definition, extends: "hw", id: "hw.algebra", name: "Dup" }),
    ).resolves.toEqual({ error: "preset/exists", ok: false });
    await expect(
      world.actions.updatePreset({ definition, extends: "hw", id: "hw.nope", name: "X" }),
    ).resolves.toEqual({ error: "preset/unknown", ok: false });
    await expect(world.actions.archivePreset("hw")).resolves.toEqual({
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

  it("offers the plan's estimate buckets until stage 3 fills them", async () => {
    const world = await setupActions([]);
    expect(world.actions.estimateHints("hw")).toEqual(
      ESTIMATE_BUCKET_MINUTES.map((minutes) => ({ minutes, samples: [] })),
    );
  });
});

describe("ensureInstances", () => {
  it("adds the missing instances and automatic outcomes as system events, once", async () => {
    const world = await setupActions();
    await expect(world.actions.ensureInstances()).resolves.toBe(1);
    const missed = world.state.store
      .getState()
      .log.find((event) => event.id === autoOutcomeId(CALC_HW5_ID, "missed"));
    expect(missed).toMatchObject({ source: "system", deviceId: "dev-1" });
    expect(taskOf(world, CALC_HW5_ID)?.closed?.outcome).toBe("cancelled_missed");
    await expect(world.actions.ensureInstances()).resolves.toBe(0);

    world.setNow("2026-10-13T12:00:00.000Z");
    await expect(world.actions.ensureInstances()).resolves.toBe(5);
    const log = world.state.store.getState().log;
    for (const id of ["hw:hw.algebra:2026-W42", "hw:hw.calculus:2026-W42"]) {
      expect(log.find((event) => event.id === id)).toMatchObject({ source: "system" });
    }
    expect(taskOf(world, "hw:hw.algebra:2026-W42")?.title).toBe("Algebra HW 2");
    expect(taskOf(world, TRK_ID)?.closed?.outcome).toBe("cancelled_missed");
    await expect(world.actions.ensureInstances()).resolves.toBe(0);
  });

  it("does not recreate an instance whose creation was revoked", async () => {
    const world = await setupActions();
    // System-made instances share their id with their creation event.
    unwrap(await world.actions.revoke(CALC_W41_ID));
    expect(taskOf(world, CALC_W41_ID)).toBeUndefined();
    await expect(world.actions.ensureInstances()).resolves.toBe(1);
    expect(taskOf(world, CALC_W41_ID)).toBeUndefined();
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
    await expect(world.actions.runReviewAction(item, "keep-open")).resolves.toEqual({
      ok: true,
      value: [],
    });
    await expect(world.actions.runReviewAction(item, "undo")).resolves.toEqual({
      error: "action/unknown-review-action",
      ok: false,
    });
  });

  it("rematerializes after a correction and confirms or undoes automatic outcomes", async () => {
    const world = await setupActions();
    await world.actions.ensureInstances();
    const item = reviewItems(world.state.store.getState(), ctx()).find(
      (entry) => entry.kind === "confirm-auto-outcome",
    );
    if (item === undefined) {
      throw new Error("no review item");
    }
    unwrap(await world.actions.runReviewAction(item, "confirm"));
    expect(world.rematerializeCalls()).toBe(1);
    expect(taskOf(world, CALC_HW5_ID)?.closed?.confirmed).toBe(true);
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
  it("updates the account settings", async () => {
    const world = await setupActions([]);
    unwrap(await world.actions.setLanguage("ru"));
    unwrap(await world.actions.setTimezone("UTC"));
    unwrap(await world.actions.setDigestWindows(["08:00", "20:00"]));
    unwrap(await world.actions.setQuietHours({ from: "22:00", to: "07:00" }));
    expect(world.state.store.getState().settings).toEqual({
      digestWindows: ["08:00", "20:00"],
      language: "ru",
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
});

describe("undo", () => {
  it("revokes by id and undoes the latest own event", async () => {
    const world = await setupActions();
    const [solved] = unwrap(await world.actions.markSolved(HW_ID, "s5"));
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
