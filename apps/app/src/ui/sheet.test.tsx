import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { withWindowWidth } from "#app/test/window.ts";

import { OverlayPresence } from "./overlay-presence.tsx";
import { Sheet } from "./sheet.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** The animations started, with the callbacks that finish them (the test decides when). */
const mockTimings: {
  readonly to: number;
  readonly duration: number | undefined;
  readonly done: ((isFinished: boolean) => void) | undefined;
}[] = [];

jest.mock("react-native-reanimated", (): unknown => {
  // The Jest mock of reanimated (jest.setup.ts), its timing held until the test finishes it.
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...actual,
    __esModule: true,
    withTiming: (
      to: number,
      config: undefined | { readonly duration?: number },
      done?: (isFinished: boolean) => void,
    ) => {
      mockTimings.push({ done, duration: config?.duration, to });
      return to;
    },
  };
});

jest.mock("react-native-safe-area-context", (): unknown => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

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

type Props = { readonly onClose: () => void; readonly dismissible?: boolean };

/** A sheet its owner shows while `open` and closes from `onClose`, as Day's date picker does. */
const Owned = ({ dismissible, onClose }: Props) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <ThemeProvider forced="light">
      <Sheet
        closeLabel="Close"
        dismissible={dismissible}
        name="day-picker"
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
        open={isOpen}
        title="Pick a day"
      >
        <Text>Calendar</Text>
      </Sheet>
    </ThemeProvider>
  );
};

const renderOwned = async (props: Props) => await render(<Owned {...props} />);

/** The modal (its host view keeps its props, also while it is not visible). */
const modal = () => screen.getByTestId("overlay-modal", { includeHiddenElements: true });

/** The modal's own close request: Android's system Back, and Escape on the web (react-native-web). */
const requestClose = async (): Promise<void> => {
  await act(() => {
    (modal().props as { onRequestClose: () => void }).onRequestClose();
  });
};

const dragHandle = async (translationY: number, velocityY: number): Promise<void> => {
  await act(() => {
    fireGestureHandler(getByGestureTestId("sheet-handle"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: translationY / 2, velocityY },
      { state: State.ACTIVE, translationY, velocityY },
      { state: State.END, translationY, velocityY },
    ]);
  });
};

/** Gives the sheet its first layout: its height is known, the enter starts. */
const layOut = async (height: number): Promise<void> => {
  await fireEvent(screen.getByTestId("sheet-frame"), "layout", {
    nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } },
  });
};

/** A week block its owner mounts only while picked, as Week does. */
const Picker = () => {
  const [picked, setPicked] = useState<null | string>("Seminar");
  return (
    <ThemeProvider forced="light">
      <OverlayPresence value={picked}>
        {(kept) => (
          <Sheet
            closeLabel="Close"
            name="week-pick"
            onClose={() => {
              setPicked(null);
            }}
            open
            title={kept}
          >
            <Text>Details</Text>
          </Sheet>
        )}
      </OverlayPresence>
    </ThemeProvider>
  );
};

describe("Sheet on a phone (spec §4.2.21, §6 sheet)", () => {
  it("is named by its title (the modal is the dialog, aria-labelledby the title)", async () => {
    await renderOwned({ onClose: jest.fn() });
    const title = screen.getByRole("header", { name: "Pick a day" });
    expect(modal().props["aria-labelledby"]).toBe(title.props["nativeID"]);
  });

  it("closes once on a tap on the dim, which is never a keyboard stop", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    const scrim = screen.getByTestId("overlay-scrim");
    expect(scrim.props["tabIndex"]).toBe(-1);
    await fireEvent.press(scrim);
    await fireEvent.press(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes once on Back (and Escape on the web), however often it is asked during the exit", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    await requestClose();
    await requestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes once when its handle is dragged past 30 % of its height (F-CMP-02)", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    await layOut(400);
    await dragHandle(140, 100);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a flick of 800 dp/s, and springs back from a short slow drag", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    await layOut(400);
    await dragHandle(40, 200);
    expect(onClose).not.toHaveBeenCalled();
    await dragHandle(40, 900);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open against a drag, the dim and Back when it may not be dismissed", async () => {
    const onClose = jest.fn();
    await renderOwned({ dismissible: false, onClose });
    await layOut(400);
    await dragHandle(300, 2000);
    await fireEvent.press(screen.getByTestId("overlay-scrim"));
    await requestClose();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("travels its own height in, and out again, keeping its content until the exit finishes (F-MOT-05)", async () => {
    await renderOwned({ onClose: jest.fn() });
    await layOut(420);
    // In: from its own height (420, not the window's) to its place in 280.
    expect(mockTimings).toEqual(
      expect.arrayContaining([expect.objectContaining({ duration: 280, to: 0 })]),
    );
    mockTimings.length = 0;
    await fireEvent.press(screen.getByTestId("overlay-scrim"));
    // Out: down its own height in 200, the dim fading where it is; still shown meanwhile.
    expect(mockTimings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ duration: 200, to: 420 }),
        expect.objectContaining({ duration: 200, to: 0 }),
      ]),
    );
    expect(modal().props["visible"]).toBe(true);
    expect(screen.getByText("Calendar")).toBeOnTheScreen();
    await finishAll();
    expect(screen.queryByTestId("overlay-modal", { includeHiddenElements: true })).toBeNull();
  });

  it("lets an owner that mounts it only while open keep it through the exit (OverlayPresence)", async () => {
    await render(<Picker />);
    await fireEvent.press(screen.getByTestId("overlay-scrim"));
    expect(screen.getByRole("header", { name: "Seminar" })).toBeOnTheScreen();
    await finishAll();
    expect(screen.queryByText("Details")).toBeNull();
  });

  it("has a grab handle TalkBack can close it with", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    const handle = screen.getByTestId("sheet-handle-zone");
    expect(handle.props["accessibilityLabel"]).toBe("Close");
    await fireEvent(handle, "accessibilityAction", { nativeEvent: { actionName: "escape" } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet on a wide window is the Dialog (spec §4.2.21, §6 dialog)", () => {
  withWindowWidth(1440);

  it("closes once from its cross, and scales in from 96 %, never from nothing (F-MOT-06)", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    expect(screen.queryByTestId("sheet-handle-zone")).toBeNull();
    // Its first frame: 96 % and transparent, growing to 1 in 220 (the test's values do not run).
    const style = JSON.stringify(screen.getByTestId("dialog-frame").props["style"]);
    expect(style).toContain('"scale":0.96');
    expect(mockTimings).toEqual(
      expect.arrayContaining([expect.objectContaining({ duration: 220, to: 1 })]),
    );
    const cross = screen.getByRole("button", { name: "Close" });
    await fireEvent.press(cross);
    await fireEvent.press(cross);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Out in 160, to 98 %: the frame shrinks from 1 towards 0.98 while it fades.
    expect(mockTimings).toEqual(
      expect.arrayContaining([expect.objectContaining({ duration: 160, to: 0 })]),
    );
  });

  it("closes once on Escape or a click outside", async () => {
    const onClose = jest.fn();
    await renderOwned({ onClose });
    await requestClose();
    // Beside the cross the dim is hidden from assistive tech; a pointer still clicks it.
    await fireEvent.press(screen.getByTestId("overlay-scrim", { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
