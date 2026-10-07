import { describe, expect, it } from "vitest";

import {
  ALGEBRA_ID,
  artboardState,
  ctx,
  INBOX_CABLE_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  INBOX_TEXTS,
  MOSCOW,
  WORK_ID,
} from "@pace/core/testing";

import { inboxViewModel } from "./inbox.ts";

const DAY = 24 * 60;

describe("inboxViewModel", () => {
  const inbox = inboxViewModel(artboardState(), ctx());

  it("lists the cards oldest first with their age and the too-long flag", () => {
    expect(inbox.count).toBe(3);
    expect(inbox.cards.map((card) => [card.id, card.ageMinutes, card.tooLong])).toEqual([
      [INBOX_CABLE_ID, 6 * DAY, true],
      [INBOX_GRADE_ID, 2 * DAY, false],
      [INBOX_SYNC_ID, 5 * 60, false],
    ]);
    expect(inbox.cards[0]?.text).toBe(INBOX_TEXTS[INBOX_CABLE_ID]);
  });

  it("turns the suggestion into chips", () => {
    expect(inbox.cards[2]?.chips).toEqual([
      { color: "violet", id: WORK_ID, kind: "project", name: "Work" },
      { id: "work", kind: "preset", name: "Work" },
      { at: "2026-10-09T20:59:00.000Z", kind: "due", relative: "later", tz: MOSCOW },
      { importance: "prioritized", kind: "importance" },
    ]);
    expect(inbox.cards[0]?.chips).toEqual([
      { id: "personal", kind: "preset", name: "Personal" },
      { kind: "no-deadline" },
      { importance: "nice_to_have", kind: "importance" },
    ]);
    expect(inbox.cards[1]?.chips[0]).toMatchObject({ id: ALGEBRA_ID, kind: "project" });
    expect(inbox.cards[2]?.suggestion.presetId).toBe("work");
  });
});
