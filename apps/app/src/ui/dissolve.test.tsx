import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import * as reanimated from "react-native-reanimated";

import { Dissolve } from "./dissolve.tsx";

/** Holds every animation's completion until the test reports it. */
const holdAnimations = () => {
  const completions: ((isFinished?: boolean) => void)[] = [];
  jest.spyOn(reanimated, "withTiming").mockImplementation((to, _config, onEnd) => {
    if (onEnd !== undefined) {
      completions.push(onEnd);
    }
    return to;
  });
  return completions;
};

const row = (isActive: boolean, onDone: () => void) => (
  <Dissolve isActive={isActive} onDone={onDone}>
    <Text>Reply to course curator</Text>
  </Dissolve>
);

describe("Dissolve (the check-off's fade and close-up, spec §6)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("is done when its animation reports it has finished, never on a timer (F-MOT-03)", async () => {
    jest.useFakeTimers();
    const completions = holdAnimations();
    const onDone = jest.fn();
    const view = await render(row(false, onDone));
    await view.rerender(row(true, onDone));
    await jest.advanceTimersByTimeAsync(5000);
    expect(jest.getTimerCount()).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
    for (const done of completions) {
      done(true);
    }
    await jest.advanceTimersByTimeAsync(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not finish an animation that was taken over (a refused close puts the row back)", async () => {
    const completions = holdAnimations();
    const onDone = jest.fn();
    const view = await render(row(false, onDone));
    await view.rerender(row(true, onDone));
    await view.rerender(row(false, onDone));
    for (const done of completions) {
      done(false);
    }
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Reply to course curator")).toBeOnTheScreen();
  });

  it("keeps its content mounted through the run: the row is never a blank hole", async () => {
    holdAnimations();
    const view = await render(row(false, jest.fn()));
    await view.rerender(row(true, jest.fn()));
    expect(screen.getByText("Reply to course curator")).toBeOnTheScreen();
  });
});
