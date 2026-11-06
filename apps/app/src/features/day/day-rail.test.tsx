import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { dayRail, type DayRail as DayRailModel, type RailBlock } from "@pace/client";

import { DayRail, NowMargin } from "./day-rail.tsx";

const at = (time: string): string => `2026-10-06T${time}:00.000Z`;

const block = (from: string, to: string, extra: Partial<RailBlock> = {}): RailBlock => ({
  color: "blue",
  endAt: at(to),
  isAlongside: false,
  isRunning: false,
  startAt: at(from),
  ...extra,
});

const draw = async (rail: DayRailModel, now = at("12:00")) =>
  await renderScreen(
    <>
      <DayRail rail={rail} />
      <NowMargin now={now} rail={rail} zone="UTC" />
    </>,
    await createTestRuntime(),
  );

const HIDDEN = { includeHiddenElements: true } as const;

describe("DayRail and NowMargin (Task 7.1, spec §2 A)", () => {
  it("is hidden from screen readers and takes no touches: the rows carry the meaning", async () => {
    await draw(dayRail([block("08:00", "09:00")], [], at("08:30")));
    const rail = screen.getByTestId("day-rail", HIDDEN);
    expect(rail).toHaveProp("accessibilityElementsHidden", true);
    expect(rail).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(rail).toHaveProp("pointerEvents", "none");
    expect(screen.getByTestId("now-margin", HIDDEN)).toHaveProp(
      "accessibilityElementsHidden",
      true,
    );
  });

  it("draws a band per block, a dashed one per gap and a break where a gap was cut short", async () => {
    await draw(
      dayRail(
        [block("00:00", "01:00"), block("16:00", "17:00")],
        [{ endAt: at("16:00"), startAt: at("01:00") }],
        at("23:00"),
      ),
    );
    expect(screen.getAllByTestId("rail-block", HIDDEN)).toHaveLength(2);
    expect(screen.getAllByTestId("rail-gap", HIDDEN)).toHaveLength(1);
    expect(screen.getByTestId("rail-scale-break", HIDDEN)).toBeOnTheScreen();
  });

  it("draws a parallel block narrower, its overlap hatched", async () => {
    await draw(dayRail([block("08:00", "10:00"), block("09:00", "09:30")], [], at("23:00")));
    expect(screen.getByTestId("rail-parallel", HIDDEN)).toBeOnTheScreen();
    expect(screen.getByTestId("rail-overlap", HIDDEN)).toBeOnTheScreen();
  });

  it("puts now on the rail with its time while it falls inside what is drawn", async () => {
    await draw(
      dayRail([block("08:00", "10:00", { isRunning: true })], [], at("09:30")),
      at("09:30"),
    );
    expect(screen.getByText("09:30", HIDDEN)).toBeOnTheScreen();
  });

  it("has no margin line when now is outside what is drawn", async () => {
    await draw(dayRail([block("08:00", "09:00")], [], at("12:00")), at("12:00"));
    expect(screen.queryByTestId("now-margin", HIDDEN)).toBeNull();
  });
});
