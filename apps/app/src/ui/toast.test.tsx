import { act, fireEvent, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { space, splitGraphemes, t } from "@pace/core";

import {
  useContentRegionLayout,
  useFloatPlace,
  useLiftToastAbove,
  usePublishColumn,
  usePublishStatus,
  usePublishTabBar,
} from "./float-layer.ts";
import { TOAST_QUOTE_GRAPHEMES, toastQuote, useToast } from "./toast.tsx";

const Shows = ({ message }: { readonly message: string }) => {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message });
  }, [message, toast]);
  return null;
};

const LONG =
  "Calendar starts the meeting that is on now or within 15 minutes. Pace has no access to the calendar yet.";

const TAB_BAR = 80;
const FOOTER = 88;
const PILL = 44;

/** A phone's chrome as the layer hears it: the tab bar, a screen's footer, maybe the offline pill. */
const Chrome = ({ hasPill = false }: { readonly hasPill?: boolean }) => {
  usePublishTabBar(TAB_BAR, true);
  useLiftToastAbove(FOOTER, true);
  usePublishStatus(hasPill ? PILL : 0);
  return null;
};

/** Where the toast's box is placed. */
const placeStyle = (): ViewStyle =>
  StyleSheet.flatten(screen.getByTestId("toast-place").props["style"] as ViewStyle);

/** The shell's content region beside a sidebar, as the shell publishes it. */
const Region = () => {
  const onLayout = useContentRegionLayout(true);
  return <View onLayout={onLayout} testID="region" />;
};

/** A screen in front, keeping to a column of `width`. */
const Column = ({ width }: { readonly width: number }) => {
  usePublishColumn(width, true);
  return null;
};

/** What the layer tells a list about its foot. */
const Inset = () => <Text testID="inset">{String(useFloatPlace().inset)}</Text>;

/** A toast that arrives later, on a press. */
const Later = () => {
  const toast = useToast();
  return (
    <Text
      accessibilityRole="button"
      onPress={() => {
        toast.show({ message: "Deleted" });
      }}
    >
      Delete
    </Text>
  );
};

/**
Lets `ms` pass, then the toast's exit finish: the exit lets go from the animation's completion,
which the worklets mock hands over as a microtask (faked with the clock).
*/
const pass = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    jest.runAllTicks();
  });
};

const renderToast = async (ui: React.ReactElement, { isClockStill = false } = {}) => {
  const runtime = await createTestRuntime({ world: "empty" });
  if (isClockStill) {
    // From here on time passes only when the test says so (the toast's timer starts on show).
    jest.useFakeTimers();
  }
  await renderScreen(ui, runtime);
};

describe("ToastProvider", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("hides a short toast after five seconds", async () => {
    await renderToast(<Shows message="Deleted" />, { isClockStill: true });
    expect(screen.getByText("Deleted")).toBeOnTheScreen();
    await pass(5100);
    expect(screen.queryByText("Deleted")).toBeNull();
  });

  it("keeps a long one long enough to read it through", async () => {
    await renderToast(<Shows message={LONG} />, { isClockStill: true });
    await pass(5100);
    expect(screen.getByText(LONG)).toBeOnTheScreen();
  });

  it("waits while the pointer is on it, and counts again once it leaves (WCAG 2.2.1)", async () => {
    await renderToast(<Shows message="Deleted" />, { isClockStill: true });
    await fireEvent(screen.getByTestId("toast"), "pointerEnter");
    await pass(20_000);
    expect(screen.getByText("Deleted")).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("toast"), "pointerLeave");
    await pass(5100);
    expect(screen.queryByText("Deleted")).toBeNull();
  });

  it("is closed by its Close button; its words are not a control (F-A11Y-14)", async () => {
    await renderToast(<Shows message="Deleted" />);
    expect(screen.getByText("Deleted").props["onPress"]).toBeUndefined();
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    expect(screen.queryByText("Deleted")).toBeNull();
  });
});

describe("where the toast floats (spec §4.1.4, F-CMP-12)", () => {
  it("sits space.3 above the measured tab bar and the screen's footer", async () => {
    await renderToast(
      <>
        <Chrome />
        <Shows message="Deleted" />
      </>,
    );
    expect(placeStyle().bottom).toBe(TAB_BAR + FOOTER + space["3"]);
  });

  it("stacks above the offline pill instead of over it (review #6)", async () => {
    await renderToast(
      <>
        <Chrome hasPill />
        <Shows message="Deleted" />
      </>,
    );
    expect(placeStyle().bottom).toBe(TAB_BAR + FOOTER + space["3"] + PILL + space["3"]);
  });

  it("keeps to the content region beside the sidebar, never across it (R23-13a)", async () => {
    await renderToast(
      <>
        <Region />
        <Shows message="Deleted" />
      </>,
    );
    await fireEvent(screen.getByTestId("region"), "layout", {
      nativeEvent: { layout: { height: 900, width: 1192, x: 248, y: 0 } },
    });
    expect(placeStyle().left).toBe(248 + 16);
  });

  it("keeps to the screen's column on a wide window, not the room beside it (QA PR55-1-14)", async () => {
    await renderToast(
      <>
        <Region />
        <Column width={720} />
        <Shows message="Deleted" />
      </>,
    );
    const area = screen.getByTestId("toast-place").parent;
    if (area === null) {
      throw new Error("The toast's place has no area around it");
    }
    await fireEvent(area, "layout", {
      nativeEvent: { layout: { height: 900, width: 1440, x: 0, y: 0 } },
    });
    await fireEvent(screen.getByTestId("region"), "layout", {
      nativeEvent: { layout: { height: 900, width: 1192, x: 248, y: 0 } },
    });
    // The column runs 248–968: the stack is centred over it, 16 in from each of its edges.
    expect(placeStyle()).toMatchObject({ left: 248 + 16, right: 1440 - 968 + 16 });
  });

  it("tells a list how far it reaches over the content's foot while it shows", async () => {
    await renderToast(
      <>
        <Inset />
        <Shows message="Deleted" />
      </>,
    );
    await fireEvent(screen.getByTestId("toast"), "layout", {
      nativeEvent: { layout: { height: 52, width: 358, x: 0, y: 0 } },
    });
    expect(screen.getByTestId("inset")).toHaveTextContent(String(52 + 2 * space["3"]));
  });
});

describe("what a screen reader hears (spec §4.2.30)", () => {
  it("is a polite status region that is there before any toast, so a toast is announced once, as it arrives", async () => {
    await renderToast(<Later />);
    const region = screen.getByTestId("toast");
    expect(region.props).toMatchObject({ "aria-live": "polite", role: "status" });
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    // The words land in the region that was already there: it is not mounted with them.
    expect(screen.getByTestId("toast")).toBe(region);
    expect(screen.getByTestId("toast")).toHaveTextContent(/Deleted/u);
    // Moving it (a footer arriving) leaves the words as they are: nothing is said again.
    await fireEvent(region, "layout", {
      nativeEvent: { layout: { height: 52, width: 358, x: 0, y: 0 } },
    });
    expect(screen.getAllByText("Deleted")).toHaveLength(1);
  });
});

describe("the toast's words (QA round 22 R22-01)", () => {
  // The sentences a toast says on its own, longest first: a refused tap and the refusals beside it.
  const SENTENCES = [
    "actionError.persist_failed",
    "settings.push.notSaved",
    "notifications.failedAction",
  ] as const;

  it.each(["en", "ru"] as const)(
    "shows a sentence of its own in full, never cut (%s)",
    async (language) => {
      for (const key of SENTENCES) {
        const message = t(language, key);
        const view = await renderScreen(
          <Shows message={message} />,
          await createTestRuntime({ world: "empty" }),
        );
        // UI text wraps and is never truncated (spec 4.1.2 rule 3): no line limit on the message.
        expect(screen.getByText(message).props["numberOfLines"]).toBeUndefined();
        await view.unmount();
      }
    },
  );

  it("quotes a value from data short, so the sentence around it stays whole", () => {
    const title = "Междисциплинарная ".repeat(20).trim();
    const quoted = toastQuote(title);
    expect(splitGraphemes(quoted)).toHaveLength(TOAST_QUOTE_GRAPHEMES);
    expect(quoted.endsWith("…")).toBe(true);
    expect(toastQuote("Buy milk")).toBe("Buy milk");
  });
});
