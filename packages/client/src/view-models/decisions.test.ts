import { describe, expect, it } from "vitest";

import type { Decision, Event } from "@pace/core";

import { artboardState, at, BOOKS_ID } from "@pace/core/testing";

import { decisionView } from "./decisions.ts";

const DECIDED = "2026-10-06T10:00:00.000Z";
/** Late enough that every event of a test is in the state. */
const LATER = "2026-10-09T12:00:00.000Z";
const CABLE_ID = "t-cable";

const NO_STEP = {
  activityId: null,
  closeOutcome: null,
  fields: [],
  startAt: null,
  subject: null,
  taskId: null,
};

const parsed = (inputs: Record<string, unknown>, rest: Partial<Decision> = {}): Decision => ({
  at: DECIDED,
  explanation: "Parsed by gpt-5.6-luna; not found in the text: project, subtasks.",
  id: "d1",
  inputs,
  kind: "parse",
  outcome: "parsed",
  rule: "parse.task.create",
  taskId: null,
  ...rest,
});

const cable = parsed({
  actions: ["The assistant will create “Buy cable”"],
  channel: "api",
  doubtful: ["project", "subtasks"],
  provider: "gpt-5.6-luna#2",
  steps: [{ ...NO_STEP, kind: "task.create", subject: "Buy cable" }],
  text: "buy cable tomorrow #home",
});

const created = (occurredAt: string, sourceText: string): Event =>
  at(950, occurredAt, {
    payload: {
      fields: {},
      presetId: "personal",
      sourceText,
      subtasks: [],
      taskId: CABLE_ID,
      title: "Buy cable",
    },
    type: "task.created",
  });

const started = (occurredAt: string, label: string): Event =>
  at(951, occurredAt, {
    payload: { activityId: "a-gym", category: "sport", label },
    type: "activity.started",
  });

const en = (decision: Decision, extra: readonly Event[] = []) =>
  decisionView(decision, { language: "en", state: artboardState(LATER, extra) });
const ru = (decision: Decision, extra: readonly Event[] = []) =>
  decisionView(decision, { language: "ru", state: artboardState(LATER, extra) });

describe("decisionView", () => {
  it("says what became of the message, quotes it, and names what the text did not hold", () => {
    expect(en(cable, [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")])).toEqual({
      at: DECIDED,
      id: "d1",
      lines: ["Created task “Buy cable”"],
      note: null,
      notFound: "Not in your text: project, subtasks",
      outcome: "You approved it",
      request: "buy cable tomorrow #home",
      taskId: CABLE_ID,
      via: "via gpt-5.6-luna",
    });
    expect(ru(cable, [created("2026-10-06T10:00:20.000Z", "buy cable tomorrow #home")])).toEqual(
      expect.objectContaining({
        lines: ["Создана задача «Buy cable»"],
        notFound: "Не нашлось в вашем тексте: проект, подзадачи",
        outcome: "Вы подтвердили",
        request: "buy cable tomorrow #home",
        via: "через gpt-5.6-luna",
      }),
    );
  });

  it("does not claim an approval it cannot see", () => {
    expect(en(cable)).toMatchObject({
      lines: ["Suggested a new task “Buy cable”"],
      outcome: "Shown to you for approval",
      taskId: null,
    });
    // A task made a day later, or before the message, is not this one.
    expect(
      en(cable, [created("2026-10-07T11:00:00.000Z", "buy cable tomorrow #home")]),
    ).toMatchObject({ outcome: "Shown to you for approval" });
    expect(
      en(cable, [created("2026-10-06T09:00:00.000Z", "buy cable tomorrow #home")]),
    ).toMatchObject({ outcome: "Shown to you for approval" });
  });

  it("matches a created task by its title when the request was corrected", () => {
    expect(en(cable, [created("2026-10-06T10:01:00.000Z", "buy a cable")])).toMatchObject({
      outcome: "You approved it",
      taskId: CABLE_ID,
    });
  });

  it("words every kind of action, with the task's current title", () => {
    const steps = [
      { ...NO_STEP, fields: ["dueDate"], kind: "task.update", taskId: BOOKS_ID },
      { ...NO_STEP, fields: ["title", "project"], kind: "task.update", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.delete", taskId: BOOKS_ID },
      { ...NO_STEP, closeOutcome: "done", kind: "task.close", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.addSubtasks", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "task.markSubtasks", taskId: BOOKS_ID },
      { ...NO_STEP, kind: "activity.start", subject: "Gym" },
      { ...NO_STEP, kind: "activity.log", startAt: DECIDED, subject: "Walk" },
      { ...NO_STEP, activityId: "a-gone", fields: ["label"], kind: "activity.update" },
      { ...NO_STEP, activityId: "a-gone", kind: "activity.delete" },
    ];
    expect(en(parsed({ steps, text: "x" })).lines).toEqual([
      "Suggested moving the deadline of “Return library books”",
      "Suggested changing “Return library books”: title, project",
      "Suggested deleting task “Return library books”",
      "Suggested closing “Return library books” as Done",
      "Suggested subtasks for “Return library books”",
      "Suggested marking subtasks solved in “Return library books”",
      "Suggested starting “Gym”",
      "Suggested logging “Walk”",
      "Suggested changing “…”: name",
      "Suggested deleting “…” from your day",
    ]);
    // The task an edit was about can be opened.
    expect(en(parsed({ steps, text: "x" })).taskId).toBe(BOOKS_ID);
  });

  it("sees a close approved when the task was closed that way after the reading", () => {
    const close = parsed({
      steps: [{ ...NO_STEP, closeOutcome: "done", kind: "task.close", taskId: BOOKS_ID }],
      text: "books returned",
    });
    const closed = (outcome: "cancelled" | "done") =>
      at(952, "2026-10-06T10:01:00.000Z", {
        payload: { outcome, taskId: BOOKS_ID },
        type: "task.closed",
      });
    expect(en(close, [closed("done")])).toMatchObject({
      lines: ["Closed “Return library books” as Done"],
      outcome: "You approved it",
      taskId: BOOKS_ID,
    });
    expect(en(close, [closed("cancelled")]).outcome).toBe("Shown to you for approval");
  });

  it("reads an older row from its rule, summaries and explanation", () => {
    const legacy = parsed(
      {
        actions: ["The assistant will start “Gym”"],
        channel: "api",
        doubtful: [],
        output: {},
        rejected: [],
        text: "gym",
      },
      {
        explanation: "Parsed by compatible; every field matched the text.",
        rule: "parse.activity.start",
      },
    );
    expect(en(legacy)).toMatchObject({
      lines: ["Suggested starting “Gym”"],
      notFound: null,
      request: "gym",
      via: "via the assistant model",
    });
    expect(en(legacy, [started("2026-10-06T10:00:30.000Z", "Gym")])).toMatchObject({
      lines: ["Started “Gym”"],
      outcome: "You approved it",
    });
    expect(
      ru(
        parsed(
          {
            actions: ["Ассистент создаст «Купить кабель»", "Ассистент удалит «Старое»"],
            text: "к",
          },
          { explanation: "Parsed by groq-2; every field matched the text." },
        ),
      ),
    ).toMatchObject({
      lines: ["Предложена задача «Купить кабель»", "Ассистент удалит «Старое»"],
      via: "через модель ассистента",
    });
    // A summary without a quoted name is shown as it was written.
    expect(en(parsed({ actions: ["Something new"], text: "x" })).lines).toEqual(["Something new"]);
  });

  it("matches a started activity by its label near the time it was asked for", () => {
    const since = parsed({
      steps: [
        { ...NO_STEP, kind: "activity.start", startAt: "2026-10-06T09:30:00.000Z", subject: "Gym" },
      ],
      text: "gym since 12:30",
    });
    expect(en(since, [started("2026-10-06T09:30:00.000Z", "Gym")]).outcome).toBe("You approved it");
    expect(en(since, [started("2026-10-06T11:30:00.000Z", "Gym")]).outcome).toBe(
      "Shown to you for approval",
    );
    expect(en(since, [started("2026-10-06T09:30:00.000Z", "Run")]).outcome).toBe(
      "Shown to you for approval",
    );
  });

  it("says when the assistant was out, read it later, or kept it in the Inbox", () => {
    expect(
      en(
        parsed(
          { channel: "api", retryAt: null, text: "call the bank" },
          {
            explanation: "No model could answer (rate limits); the text was not parsed.",
            outcome: "unavailable",
            rule: "parse.unavailable",
          },
        ),
      ),
    ).toMatchObject({
      lines: ["The assistant was out of requests"],
      outcome: "Local rules suggested a reading instead",
      request: "call the bank",
      via: null,
    });
    const deferred = { outcome: "applied", rule: "parse.deferred" };
    expect(
      en(
        parsed(
          {
            steps: [{ ...NO_STEP, kind: "task.create", subject: "Buy cable", taskId: CABLE_ID }],
            text: "buy cable",
          },
          { ...deferred, taskId: CABLE_ID },
        ),
        [created("2026-10-06T10:00:00.000Z", "buy cable")],
      ),
    ).toMatchObject({
      lines: ["Created task “Buy cable”"],
      outcome: "Applied automatically once the assistant was back",
      taskId: CABLE_ID,
    });
    expect(en(parsed({ text: "buy cable" }, deferred))).toMatchObject({
      lines: ["Read later and applied"],
      taskId: null,
    });
    expect(
      en(parsed({ text: "buy cable" }, { outcome: "inbox", rule: "parse.deferred" })),
    ).toMatchObject({
      lines: ["Kept as a note in Inbox"],
      outcome: "The assistant could not read it later",
    });
    expect(en(parsed({ steps: [], text: "hm" })).lines).toEqual([
      "Found nothing to do in your text",
    ]);
  });

  it("words older notification rows, and keeps the explanation of anything newer", () => {
    const notification = parsed(
      {},
      {
        explanation: "A digest window.",
        kind: "notification",
        outcome: "suppressed",
        rule: "digest",
      },
    );
    expect(en(notification)).toMatchObject({
      lines: ["Notification held back"],
      note: "A digest window.",
      outcome: null,
      request: null,
    });
    expect(en({ ...notification, outcome: "sent" }).lines).toEqual(["Notification sent"]);
    expect(en({ ...notification, kind: "calendar", outcome: "moved" })).toMatchObject({
      lines: ["A digest window."],
      note: null,
    });
    expect(en(parsed({ text: "x" }, { outcome: "rethought" }))).toMatchObject({
      lines: ["Parsed by gpt-5.6-luna; not found in the text: project, subtasks."],
      request: "x",
    });
  });
});
