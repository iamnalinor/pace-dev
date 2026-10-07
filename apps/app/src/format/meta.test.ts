import type { MetaPart } from "@pace/client";

import { HW_DUE, MOSCOW, NOW } from "@pace/core/testing";

import { metaTexts } from "./meta.ts";

const viewer = { deviceTz: MOSCOW, language: "en", now: NOW } as const;

const texts = (parts: readonly MetaPart[], language: "en" | "ru" = "en") =>
  metaTexts(parts, { ...viewer, language }).map(({ text, tone }) => `${tone}:${text}`);

describe("metaTexts", () => {
  it("writes the artboard meta lines", () => {
    expect(
      texts([
        { at: HW_DUE, kind: "due", relative: "tomorrow", tz: MOSCOW, zoneDiffers: false },
        { kind: "solved", solved: 4, total: 7 },
        { kind: "sent", submitted: 2 },
      ]),
    ).toEqual(["plain:Due tomorrow 23:59", "plain:4/7 solved", "plain:2 sent"]);
    expect(texts([{ importance: "asap", kind: "importance" }, { kind: "end-of-day" }])).toEqual([
      "strong:ASAP",
      "plain:by end of day",
    ]);
    expect(
      texts([
        { importance: "prioritized", kind: "importance" },
        { kind: "behind-pace", percent: 25 },
      ]),
    ).toEqual(["strong:Prioritized", "plain:25% behind pace"]);
    expect(
      texts([
        { kind: "late", minutes: 901 },
        { count: 2, kind: "problems-left" },
      ]),
    ).toEqual(["warn:1 day late", "plain:2 problems left"]);
    expect(
      texts([
        { importance: "nice_to_have", kind: "importance" },
        { days: 12, kind: "age" },
      ]),
    ).toEqual(["plain:Nice-to-have", "plain:12 days old"]);
  });

  it("keeps a short lateness in hours and minutes", () => {
    expect(texts([{ kind: "late", minutes: 100 }])).toEqual(["warn:1h 40m late"]);
    expect(texts([{ kind: "late", minutes: 3000 }])).toEqual(["warn:3 days late"]);
  });

  it("follows the account language with the right plural forms", () => {
    expect(texts([{ count: 3, kind: "problems-left" }], "ru")).toHaveLength(1);
    expect(texts([{ days: 5, kind: "age" }], "ru")[0]).toContain("5");
  });
});
