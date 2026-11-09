import { screen } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { PeriodStepper } from "./period-stepper.tsx";

const NOTHING = (): void => undefined;

const stepper = (isAway: boolean) => (
  <PeriodStepper
    isAway={isAway}
    label="воскресенье · 8 нояб."
    nextLabel="Next day"
    onNext={NOTHING}
    onPrevious={NOTHING}
    onToday={NOTHING}
    previousLabel="Previous day"
    shortLabel="вс, 8 нояб."
    todayLabel="Сегодня"
  />
);

const atWidth = (width: number): void => {
  const size = { fontScale: 1, height: 844, scale: 3, width };
  ReactNative.Dimensions.set({ screen: size, window: size });
};

afterEach(() => {
  atWidth(390);
});

describe("PeriodStepper on a phone (design review H7)", () => {
  it("shows the short label once «Сегодня» takes its slot at 390, so it never runs off the screen", async () => {
    atWidth(390);
    await renderScreen(stepper(true), await createTestRuntime());
    expect(screen.getByText("вс, 8 нояб.")).toBeOnTheScreen();
    expect(screen.queryByText("воскресенье · 8 нояб.")).toBeNull();
  });

  it("keeps the long label on today, where «Сегодня» is not shown", async () => {
    atWidth(390);
    await renderScreen(stepper(false), await createTestRuntime());
    expect(screen.getByText("воскресенье · 8 нояб.")).toBeOnTheScreen();
  });

  it("keeps the long label on a computer's window", async () => {
    atWidth(1440);
    await renderScreen(stepper(true), await createTestRuntime());
    expect(screen.getByText("воскресенье · 8 нояб.")).toBeOnTheScreen();
  });
});
