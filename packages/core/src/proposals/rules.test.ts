import { describe, expect, it } from "vitest";

import { at } from "../materialize/task-fixture.fake.ts";
import { artboardState, ctx } from "../queries/fixture.fake.ts";
import { domainByRules, proposalsByRules } from "./rules.ts";

/** Noon in Moscow on October 6 2026 (the artboard's account zone). */
const NOON = "2026-10-06T09:00:00.000Z";
const msk = (time: string): string => new Date(`2026-10-06T${time}:00+03:00`).toISOString();

const state = artboardState(NOON, [
  at(900, "2026-10-05T10:00:00.000Z", {
    payload: { activityId: "a-before", category: "chores", label: "военкомат" },
    type: "activity.started",
  }),
]);

const byRules = (text: string, domain: "activity" | "task") =>
  proposalsByRules(text, domain, { ctx: ctx(NOON), state });

describe("proposalsByRules", () => {
  it("reads a task line by the composer's rules into a create", () => {
    const proposals = byRules("купить кабель завтра срочно", "task");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      kind: "task.create",
      task: {
        dueAt: "2026-10-07T20:59:00.000Z",
        importance: "asap",
        sourceText: "купить кабель завтра срочно",
        title: "купить кабель",
      },
    });
  });

  it("logs a typed block that is over, with the category its label had before", () => {
    expect(byRules("7:30 - 8:30 - ходил в военкомат.", "activity")).toEqual([
      {
        category: "other",
        end: msk("08:30"),
        kind: "activity.log",
        label: "ходил в военкомат",
        start: msk("07:30"),
      },
    ]);
    expect(byRules("с 7:30 до 8:30 военкомат", "activity")).toEqual([
      {
        category: "chores",
        end: msk("08:30"),
        kind: "activity.log",
        label: "военкомат",
        start: msk("07:30"),
      },
    ]);
  });

  it("logs a block that ends now, and starts one that ends a minute ahead from its beginning", () => {
    expect(byRules("11:00-12:00 чтение", "activity")[0]).toMatchObject({ kind: "activity.log" });
    expect(byRules("11:00-12:01 чтение", "activity")).toEqual([
      {
        category: "other",
        expectMinutes: 61,
        kind: "activity.start",
        label: "чтение",
        startAt: msk("11:00"),
      },
    ]);
  });

  it("logs a length typed first as the time just gone, and starts words without a span now", () => {
    expect(byRules("20 мин читал", "activity")).toEqual([
      { category: "other", end: NOON, kind: "activity.log", label: "читал", start: msk("11:40") },
    ]);
    expect(byRules("Пошел в ЦСС, 20мин", "activity")).toEqual([
      { category: "other", expectMinutes: 20, kind: "activity.start", label: "Пошел в ЦСС" },
    ]);
  });
});

describe("domainByRules", () => {
  it("takes a typed time span for an activity and anything else for a task", () => {
    const world = { ctx: ctx(NOON), state };
    expect(domainByRules("7:30-8:30 военкомат", world)).toBe("activity");
    expect(domainByRules("купить кабель", world)).toBe("task");
  });
});
