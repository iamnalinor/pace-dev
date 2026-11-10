import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text, type ViewStyle } from "react-native";

import { type ComposerShape, ComposerUnfold, useComposerUnfold } from "./composer-unfold.tsx";

/** The animations started, with the callbacks that finish them (the test decides when). */
const mockTimings: {
  readonly duration: number;
  readonly to: number;
  readonly done: ((isFinished: boolean) => void) | undefined;
}[] = [];

jest.mock("react-native-reanimated", (): unknown => {
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...actual,
    __esModule: true,
    withTiming: (
      to: number,
      config: { readonly duration: number },
      done?: (isFinished: boolean) => void,
    ) => {
      mockTimings.push({ done, duration: config.duration, to });
      return to;
    },
  };
});

beforeEach(() => {
  mockTimings.length = 0;
});

const Harness = ({ shape }: { readonly shape: ComposerShape }) => {
  const unfold = useComposerUnfold(shape);
  return (
    <ComposerUnfold {...unfold}>
      <Text>{unfold.shape}</Text>
    </ComposerUnfold>
  );
};

const finishLast = async (): Promise<void> => {
  await act(() => {
    mockTimings.at(-1)?.done?.(true);
  });
};

const layOut = async (height: number): Promise<void> => {
  await fireEvent(screen.getByText(/form|line/u).parent as never, "layout", {
    nativeEvent: { layout: { height, width: 300, x: 0, y: 0 } },
  });
};

const opacityOfContent = (): unknown =>
  StyleSheet.flatten(screen.getByText(/form|line/u).parent?.props["style"] as ViewStyle).opacity;

describe("The composer's unfold (spec §6, F-MOT-08)", () => {
  it("grows the card to the form's height with the form unseen, then fades it in", async () => {
    const view = await render(<Harness shape="line" />);
    await view.rerender(<Harness shape="form" />);
    // The form is laid out at once and unseen while the card grows to its measured height.
    expect(screen.getByText("form")).toBeOnTheScreen();
    expect(opacityOfContent()).toBe(0);
    await layOut(480);
    expect(mockTimings.at(-1)).toMatchObject({ duration: 160, to: 480 });
    await finishLast();
    expect(mockTimings.at(-1)).toMatchObject({ duration: 100, to: 1 });
    await finishLast();
    expect(
      StyleSheet.flatten(screen.getByText("form").parent?.props["style"] as ViewStyle),
    ).toEqual({});
  });

  it("fades the form out first, then shrinks the card to the line, then fades the line in", async () => {
    const view = await render(<Harness shape="form" />);
    await layOut(480);
    await view.rerender(<Harness shape="line" />);
    expect(screen.getByText("form")).toBeOnTheScreen();
    expect(mockTimings.at(-1)).toMatchObject({ duration: 110, to: 0 });
    await finishLast();
    expect(screen.getByText("line")).toBeOnTheScreen();
    await layOut(48);
    expect(mockTimings.at(-1)).toMatchObject({ duration: 160, to: 48 });
    await finishLast();
    expect(mockTimings.at(-1)).toMatchObject({ to: 1 });
  });

  it("is simply there on the first render (F-MOT-07)", async () => {
    await render(<Harness shape="form" />);
    expect(mockTimings).toEqual([]);
    expect(screen.getByText("form")).toBeOnTheScreen();
  });
});
