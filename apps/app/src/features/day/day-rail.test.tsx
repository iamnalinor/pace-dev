import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { dayRail, type RailBlock, type RailEntry } from "@pace/client";

import { DayRail, NowMargin, type RowFrames } from "./day-rail.tsx";

const at = (time: string): string => `2026-10-06T${time}:00.000Z`;

const block = (from: string, to: string, extra: Partial<RailBlock> = {}): RailEntry => ({
  key: `block-${from}`,
  kind: "activity",
  row: {
    color: "blue",
    endAt: at(to),
    isAlongside: false,
    isRunning: false,
    startAt: at(from),
    ...extra,
  },
});

const gap = (from: string, to: string): RailEntry => ({
  gap: { endAt: at(to), startAt: at(from) },
  key: `gap-${from}`,
  kind: "gap",
});

/** Rows stacked from the top, each as tall as given. */
const stacked = (entries: readonly RailEntry[], heights: readonly number[]): RowFrames => {
  let top = 0;
  return Object.fromEntries(
    entries.map((entry, index) => {
      const height = heights[index] ?? 0;
      const frame = { height, top };
      top += height;
      return [entry.key, frame];
    }),
  );
};

const draw = async (entries: readonly RailEntry[], frames: RowFrames, now = at("23:00")) => {
  const rail = dayRail(entries, now);
  await renderScreen(
    <>
      <DayRail frames={frames} rail={rail} />
      <NowMargin frames={frames} now={now} rail={rail} zone="UTC" />
    </>,
    await createTestRuntime(),
  );
};

const HIDDEN = { includeHiddenElements: true } as const;

const classesOf = (node: { readonly props: Record<string, unknown> }): readonly string[] =>
  String(node.props["className"]).split(" ");

describe("DayRail and NowMargin (Task 7.1, owner 2026-11-09: the rail lines up with the rows)", () => {
  it("is hidden from screen readers and takes no touches: the rows carry the meaning", async () => {
    const entries = [block("08:00", "09:00", { isRunning: true })];
    await draw(entries, stacked(entries, [60]), at("08:30"));
    const rail = screen.getByTestId("day-rail", HIDDEN);
    expect(rail).toHaveProp("accessibilityElementsHidden", true);
    expect(rail).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(rail).toHaveProp("pointerEvents", "none");
    const margin = screen.getByTestId("now-margin", HIDDEN);
    expect(margin).toHaveProp("accessibilityElementsHidden", true);
    expect(margin).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });

  it("stands one bar beside each row, its top and height the row's own", async () => {
    const entries = [block("08:00", "09:00"), gap("09:00", "11:00"), block("11:00", "12:00")];
    await draw(entries, stacked(entries, [72, 52, 110]));
    expect(screen.getAllByTestId("rail-bar", HIDDEN)).toHaveLength(3);
    // The frame each bar is drawn in (its look is a plain View inside: bug-lessons 148).
    const bars = screen.getAllByTestId("rail-slot", HIDDEN);
    expect(bars[0]).toHaveStyle({ height: 72, top: 0 });
    expect(bars[1]).toHaveStyle({ height: 52, top: 72 });
    expect(bars[2]).toHaveStyle({ height: 110, top: 124 });
  });

  it("draws a block in its category's tint and stroke, a gap dashed with no hue", async () => {
    const entries = [block("08:00", "09:00", { color: "green" }), gap("09:00", "10:00")];
    await draw(entries, stacked(entries, [60, 60]));
    const [bar, gapBar] = screen.getAllByTestId("rail-bar", HIDDEN);
    expect(classesOf(bar ?? { props: {} })).toContain("bg-hue-green-tint");
    expect(String(screen.getByTestId("rail-pen", HIDDEN).props["className"])).toContain(
      "border-hue-green-stroke",
    );
    expect(classesOf(gapBar ?? { props: {} })).toEqual(
      expect.arrayContaining(["border-dashed", "border-outline"]),
    );
    expect(classesOf(gapBar ?? { props: {} }).some((name) => name.includes("hue-"))).toBe(false);
  });

  it("draws a parallel block's bar narrower, beside the main one", async () => {
    const entries = [block("08:00", "10:00"), block("09:00", "09:30", { isAlongside: true })];
    await draw(entries, stacked(entries, [60, 60]));
    const [main, parallel] = screen.getAllByTestId("rail-bar", HIDDEN);
    expect(classesOf(main ?? { props: {} })).toContain("w-3");
    expect(classesOf(parallel ?? { props: {} })).toContain("w-2");
  });

  it("draws no bar for a row not measured yet, rather than guess where it is", async () => {
    const entries = [block("08:00", "09:00"), block("10:00", "11:00")];
    await draw(entries, stacked(entries.slice(0, 1), [60]));
    expect(screen.getAllByTestId("rail-bar", HIDDEN)).toHaveLength(1);
  });

  it("puts the now line at the running row's bottom, where its bar ends, with the time", async () => {
    const entries = [block("08:00", "09:00"), block("09:00", "09:30", { isRunning: true })];
    await draw(entries, stacked(entries, [60, 80]), at("09:30"));
    expect(screen.getByTestId("now-margin", HIDDEN)).toHaveStyle({ top: 140 });
    expect(screen.getByText("09:30", HIDDEN)).toBeOnTheScreen();
  });

  it("puts the now line inside a row in proportion to its time", async () => {
    const entries = [block("08:00", "09:30"), gap("09:30", "11:30")];
    await draw(entries, stacked(entries, [60, 80]), at("11:00"));
    expect(screen.getByTestId("now-margin", HIDDEN)).toHaveStyle({ top: 120 });
  });

  it("has no margin line when now is outside the rows", async () => {
    const entries = [block("08:00", "09:00")];
    await draw(entries, stacked(entries, [60]), at("12:00"));
    expect(screen.queryByTestId("now-margin", HIDDEN)).toBeNull();
  });
});
