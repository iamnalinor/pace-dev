import { describe, expect, it } from "vitest";

import { INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import {
  ALGEBRA_ID,
  artboardState,
  ctx,
  INBOX_CABLE_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  INBOX_TEXTS,
  MOSCOW,
  NOW,
  WORK_ID,
} from "./fixture.fake.ts";
import { suggestFor } from "./suggest.ts";

describe("suggestFor", () => {
  const state = artboardState();

  it("sends a grade question to the course worked on most recently: Algebra", () => {
    expect(suggestFor(state, INBOX_TEXTS[INBOX_GRADE_ID], ctx())).toEqual({
      presetId: "personal",
      projectId: ALGEBRA_ID,
      importance: "nice_to_have",
      dueAt: null,
      dueTz: null,
    });
  });

  it("reads a dashboard sync due Friday as prioritized work", () => {
    expect(suggestFor(state, INBOX_TEXTS[INBOX_SYNC_ID], ctx())).toEqual({
      presetId: "work",
      projectId: WORK_ID,
      importance: "prioritized",
      dueAt: "2026-10-09T20:59:00.000Z",
      dueTz: MOSCOW,
    });
  });

  it("leaves a cable to buy as a personal errand without a due", () => {
    expect(suggestFor(state, INBOX_TEXTS[INBOX_CABLE_ID], ctx())).toEqual({
      presetId: "personal",
      projectId: null,
      importance: "nice_to_have",
      dueAt: null,
      dueTz: null,
    });
  });

  it("matches a course preset by name in either script", () => {
    expect(suggestFor(state, "алгебра дз 7", ctx())).toMatchObject({
      presetId: "hw.algebra",
      projectId: ALGEBRA_ID,
    });
    expect(suggestFor(state, "Algebra problem set", ctx())).toMatchObject({
      presetId: "hw.algebra",
      projectId: ALGEBRA_ID,
    });
    expect(suggestFor(state, "calculus sheet", ctx()).presetId).toBe("hw.calculus");
  });

  it("matches a project by its name word", () => {
    expect(suggestFor(state, "ask about the work laptop", ctx())).toMatchObject({
      presetId: "work",
      projectId: WORK_ID,
    });
    expect(suggestFor(state, "calculus: ask TA about the retake", ctx()).projectId).toBe(
      "p-calculus",
    );
  });

  it("ignores archived presets", () => {
    const archived = artboardState(NOW, [
      at(80, "2026-10-06T10:00:00.000Z", {
        type: "preset.archived",
        payload: { id: "hw.algebra" },
        source: "web",
      }),
    ]);
    expect(suggestFor(archived, "алгебра дз 7", ctx()).presetId).toBe("personal");
  });

  it("reads urgency words as ASAP", () => {
    expect(suggestFor(state, "срочно позвонить в банк", ctx()).importance).toBe("asap");
    expect(suggestFor(state, "renew the certificate ASAP", ctx()).importance).toBe("asap");
  });

  it("turns weekday words into 23:59 of that day in the account zone", () => {
    expect(suggestFor(state, "до среды", ctx())).toMatchObject({
      dueAt: "2026-10-07T20:59:00.000Z",
      dueTz: MOSCOW,
      importance: "prioritized",
    });
    expect(suggestFor(state, "by monday", ctx()).dueAt).toBe("2026-10-12T20:59:00.000Z");
    expect(suggestFor(state, "сдать завтра", ctx()).dueAt).toBe("2026-10-07T20:59:00.000Z");
    expect(suggestFor(state, "today: call the clinic", ctx()).dueAt).toBe(
      "2026-10-06T20:59:00.000Z",
    );
  });

  it("takes a weekday named on that very day as today", () => {
    const friday = ctx("2026-10-09T10:00:00.000Z");
    expect(suggestFor(state, "report by friday", friday).dueAt).toBe("2026-10-09T20:59:00.000Z");
  });

  it("falls back to the device zone until the account has one", () => {
    const newYork = ctx("2026-10-06T12:00:00.000Z", "America/New_York");
    expect(suggestFor(INITIAL_CORE_STATE, "by friday", newYork)).toMatchObject({
      dueAt: "2026-10-10T03:59:00.000Z",
      dueTz: "America/New_York",
    });
  });
});
