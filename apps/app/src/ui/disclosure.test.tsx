import { act, fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Disclosure } from "./disclosure.tsx";

/** The animations started, with the callbacks that finish them (the test decides when). */
const mockTimings: {
  readonly to: number;
  readonly done: ((isFinished: boolean) => void) | undefined;
}[] = [];

jest.mock("react-native-reanimated", (): unknown => {
  // The Jest mock of reanimated (jest.setup.ts), its timing replaced: styles are drawn as computed.
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...actual,
    __esModule: true,
    withTiming: (to: number, _config: unknown, done?: (isFinished: boolean) => void) => {
      mockTimings.push({ done, to });
      return to;
    },
  };
});

beforeEach(() => {
  mockTimings.length = 0;
});

const finishAll = async (): Promise<void> => {
  await act(() => {
    for (const timing of mockTimings.splice(0)) {
      timing.done?.(true);
    }
  });
};

const Folded = ({
  initiallyOpen = false,
  onShown,
}: {
  readonly initiallyOpen?: boolean;
  readonly onShown?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  return (
    <Disclosure
      count={3}
      label="In future"
      onShown={onShown}
      onToggle={() => {
        setIsOpen(!isOpen);
      }}
      open={isOpen}
    >
      <Text>Read chapter 4</Text>
    </Disclosure>
  );
};

const renderFolded = async (props: Parameters<typeof Folded>[0] = {}) =>
  await renderScreen(<Folded {...props} />, await createTestRuntime({ world: "empty" }));

describe("Disclosure (spec §4.1.1, §6 disclosure)", () => {
  it("is a button that says expanded or collapsed, with its label and count", async () => {
    await renderFolded();
    const trigger = screen.getByRole("button", { name: "In future · 3" });
    expect(trigger).toBeCollapsed();
    expect(screen.getByText("3")).toBeOnTheScreen();
    await fireEvent.press(trigger);
    expect(screen.getByRole("button", { name: "In future · 3" })).toBeExpanded();
  });

  it("holds no content while closed, and shows it once opened", async () => {
    await renderFolded();
    expect(screen.queryByText("Read chapter 4")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "In future · 3" }));
    expect(screen.getByText("Read chapter 4")).toBeOnTheScreen();
  });

  it("keeps the content, hidden from assistive tech, until the close has finished", async () => {
    await renderFolded({ initiallyOpen: true });
    await fireEvent.press(screen.getByRole("button", { name: "In future · 3" }));
    expect(screen.queryByText("Read chapter 4")).toBeNull();
    expect(screen.getByText("Read chapter 4", { includeHiddenElements: true })).toBeTruthy();
    await finishAll();
    expect(screen.queryByText("Read chapter 4", { includeHiddenElements: true })).toBeNull();
  });

  it("rotates its one chevron a quarter turn when open", async () => {
    await renderFolded({ initiallyOpen: true });
    expect(JSON.stringify(screen.getByTestId("disclosure-chevron").props["style"])).toContain(
      "90deg",
    );
  });

  it("tells when the content is shown, after its layout and its animation (focus moves then)", async () => {
    const onShown = jest.fn();
    await renderFolded({ onShown });
    await fireEvent.press(screen.getByRole("button", { name: "In future · 3" }));
    expect(onShown).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("disclosure-content"), "layout", {
      nativeEvent: { layout: { height: 120, width: 300, x: 0, y: 0 } },
    });
    await finishAll();
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});
