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
    expect(
      texts([
        { importance: "prioritized", kind: "importance" },
        { at: HW_DUE, kind: "starts", tz: MOSCOW },
      ]),
    ).toEqual(["strong:Prioritized", "plain:Starts tomorrow 23:59"]);
    expect(
      texts([
        { isSoft: false, kind: "late", minutes: 901 },
        { count: 2, kind: "problems-left" },
      ]),
    ).toEqual(["warn:15h late", "plain:2 problems left"]);
    expect(
      texts([
        { importance: "nice_to_have", kind: "importance" },
        { kind: "age", minutes: 12 * 24 * 60 },
      ]),
    ).toEqual(["plain:Nice-to-have", "plain:12d old"]);
  });

  it("tells lateness in minutes only under an hour, and never for a soft deadline", () => {
    expect(texts([{ isSoft: false, kind: "late", minutes: 40 }])).toEqual(["warn:40m late"]);
    expect(texts([{ isSoft: false, kind: "late", minutes: 100 }])).toEqual(["warn:1h late"]);
    expect(texts([{ isSoft: false, kind: "late", minutes: 3000 }])).toEqual(["warn:2d 2h late"]);
    expect(texts([{ isSoft: true, kind: "late", minutes: 40 }])).toEqual(["warn:<1h late"]);
  });

  it("follows the account language with the right plural forms", () => {
    expect(texts([{ count: 3, kind: "problems-left" }], "ru")).toHaveLength(1);
    expect(texts([{ kind: "age", minutes: 5 * 24 * 60 }], "ru")[0]).toContain("5");
    expect(texts([{ kind: "age", minutes: 0 }], "ru")).toEqual(["plain:только что"]);
  });
});
