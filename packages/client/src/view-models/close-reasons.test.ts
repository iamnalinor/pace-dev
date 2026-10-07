import { describe, expect, it } from "vitest";

import { recentReasons } from "./close-reasons.ts";

type Closed = Parameters<typeof recentReasons>[0][string];

const closed = (id: string, at: string, reason: null | string): readonly [string, Closed] => [
  id,
  {
    closed: {
      at,
      confirmed: false,
      eventId: `e-${id}`,
      outcome: "cancelled",
      reason,
      source: "web",
    },
  },
];

describe("recentReasons", () => {
  it("offers the people's own reasons, newest first, once each", () => {
    const tasks: Readonly<Record<string, Closed>> = Object.fromEntries([
      closed("a", "2026-10-01T10:00:00.000Z", "course dropped"),
      closed("b", "2026-10-03T10:00:00.000Z", "duplicate"),
      closed("c", "2026-10-02T10:00:00.000Z", "course dropped"),
      closed("d", "2026-10-04T10:00:00.000Z", null),
      ["e", { closed: null }],
      [
        "f",
        {
          closed: {
            at: "2026-10-05T10:00:00.000Z",
            confirmed: false,
            eventId: "e-f",
            outcome: "skipped",
            reason: "not-assigned",
            source: "system",
          },
        },
      ],
    ]);
    expect(recentReasons(tasks)).toEqual(["duplicate", "course dropped"]);
  });
});
