import { describe, expect, it } from "vitest";

import { HW_DUE, MOSCOW, NOW, TRK_DUE } from "@pace/core/testing";

import { formatMeta } from "./meta.ts";

const viewer = { deviceTz: MOSCOW, language: "en" as const, now: NOW };
const text = (segments: readonly { readonly text: string }[]): string =>
  segments.map((segment) => segment.text).join(" · ");

describe("formatMeta", () => {
  it("reads the Algebra HW 6 row: due tomorrow, solved and sent", () => {
    const segments = formatMeta(
      [
        { at: HW_DUE, kind: "due", relative: "tomorrow", tz: MOSCOW, zoneDiffers: false },
        { kind: "solved", solved: 4, total: 7 },
        { kind: "sent", submitted: 2 },
      ],
      viewer,
    );
    expect(text(segments)).toBe("Due tomorrow 23:59 · 4/7 solved · 2 sent");
    expect(segments.every((segment) => segment.tone === "plain")).toBe(true);
  });

  it("stresses ASAP and Prioritized, warns about lateness", () => {
    expect(
      formatMeta([{ importance: "asap", kind: "importance" }, { kind: "end-of-day" }], viewer),
    ).toEqual([
      { color: "coral", text: "ASAP", tone: "strong" },
      { text: "by end of day", tone: "plain" },
    ]);
    expect(
      formatMeta(
        [
          { importance: "prioritized", kind: "importance" },
          { kind: "behind-pace", percent: 25 },
        ],
        viewer,
      ),
    ).toEqual([
      { color: "amber", text: "Prioritized", tone: "strong" },
      { text: "25% behind pace", tone: "plain" },
    ]);
    expect(
      formatMeta(
        [
          { kind: "late", minutes: 15 * 60 + 1 },
          { count: 2, kind: "problems-left" },
        ],
        viewer,
      ),
    ).toEqual([
      { text: "15h 1m late", tone: "warn" },
      { text: "2 problems left", tone: "plain" },
    ]);
  });

  it("keeps a Nice-to-have quiet and counts its age", () => {
    expect(
      text(
        formatMeta(
          [
            { importance: "nice_to_have", kind: "importance" },
            { kind: "age", minutes: 12 * 24 * 60 },
          ],
          viewer,
        ),
      ),
    ).toBe("Nice-to-have · 12d old");
    expect(formatMeta([{ importance: "nice_to_have", kind: "importance" }], viewer)[0]?.tone).toBe(
      "plain",
    );
  });

  it("shows the due's own zone and the viewer's time when they differ", () => {
    const [due] = formatMeta(
      [{ at: TRK_DUE, kind: "due", relative: "later", tz: "UTC", zoneDiffers: true }],
      viewer,
    );
    expect(due?.text).toMatch(/^Due Fri Oct 9 18:00 (?:UTC|GMT) \(your time 21:00\)$/);
  });

  it("speaks Russian", () => {
    expect(
      text(
        formatMeta(
          [
            { kind: "late", minutes: 3 * 24 * 60 },
            { count: 3, kind: "problems-left" },
          ],
          { ...viewer, language: "ru" },
        ),
      ),
    ).toBe("опоздание 3 д · осталось 3 задачи");
  });
});
