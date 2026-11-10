import { fireEvent, screen, within } from "@testing-library/react-native";
import { type ComponentProps, useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";

import { deadControls } from "#app/test/dead-controls.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { space } from "@pace/core";

import { TabBar } from "./tab-bar.tsx";
import { useToast } from "./toast.tsx";

// jest renders the phone, where Space is no key; the web's handler is the one under test here.
jest.mock("./space-press.ts", (): unknown => jest.requireActual("./space-press.web.ts"));

type Props = ComponentProps<typeof TabBar>;

// More is a stack of its own (its list and the destinations it opens): the tab is its group.
const ROUTES = ["index", "day", "inbox", "(more)", "add"] as const;

const TITLES: Readonly<Record<(typeof ROUTES)[number], string>> = {
  add: en("nav.add"),
  day: en("nav.day"),
  inbox: en("nav.inbox"),
  index: en("nav.now"),
  "(more)": en("nav.more"),
};

const propsAt = (current: (typeof ROUTES)[number], navigate: jest.Mock, isFront = true): Props =>
  ({
    descriptors: Object.fromEntries(
      ROUTES.map((name) => [name, { options: { title: TITLES[name] } }]),
    ),
    isFront,
    navigation: { emit: () => ({ defaultPrevented: false }), navigate },
    state: {
      index: ROUTES.indexOf(current),
      routes: ROUTES.map((name) => ({ key: name, name, params: undefined })),
    },
  }) as unknown as Props;

describe("TabBar", () => {
  it("shows Now, Day, Inbox and More, the rest (Week first) being behind More", async () => {
    const navigate = jest.fn();
    await renderScreen(<TabBar {...propsAt("index", navigate)} />, await createTestRuntime());
    const tabs = screen.getAllByRole("tab").map((tab) => tab.props["accessibilityLabel"] as string);
    expect(tabs).toEqual([
      en("nav.now"),
      en("nav.day"),
      en("nav.inboxWaiting", { count: 4 }),
      en("nav.more"),
    ]);
    await fireEvent.press(screen.getByRole("tab", { name: en("nav.more") }));
    expect(navigate).toHaveBeenCalledWith("(more)", undefined);
  });

  it("opens a tab on Space as well as Enter (ARIA tabs; react-native-web ignores Space on role tab)", async () => {
    const navigate = jest.fn();
    await renderScreen(<TabBar {...propsAt("index", navigate)} />, await createTestRuntime());
    const target = {};
    const day = screen.getByRole("tab", { name: en("nav.day") });
    (day.props["onKeyDown"] as (event: unknown) => void)({
      currentTarget: target,
      key: " ",
      preventDefault: () => undefined,
      target,
    });
    expect(navigate).toHaveBeenCalledWith("day", undefined);
  });

  it("puts the count of what waits on the Inbox tab only, and hides it at zero", async () => {
    await renderScreen(<TabBar {...propsAt("index", jest.fn())} />, await createTestRuntime());
    const inbox = screen.getByRole("tab", { name: en("nav.inboxWaiting", { count: 4 }) });
    expect(within(inbox).getByText("4")).toBeOnTheScreen();
    expect(screen.getAllByTestId("count-badge")).toHaveLength(1);
  });

  it("anchors the badge at the icon's trailing top and grows it away from the icon (never back over it)", async () => {
    await renderScreen(<TabBar {...propsAt("index", jest.fn())} />, await createTestRuntime());
    const anchor = screen.getByTestId("count-badge").parent;
    const classes = (anchor?.props["className"] as string).split(" ");
    expect(anchor?.props["style"]).toMatchObject({ left: "100%" });
    expect(classes).toContain("-top-2");
    expect(classes.some((name) => /^-?right-/.test(name))).toBe(false);
  });

  it("has no badge on an empty Inbox", async () => {
    await renderScreen(
      <TabBar {...propsAt("index", jest.fn())} />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.queryByTestId("count-badge")).toBeNull();
    expect(screen.getByRole("tab", { name: en("nav.inbox") })).toBeOnTheScreen();
  });

  it("keeps Now selected on New task (the composer on Now)", async () => {
    await renderScreen(<TabBar {...propsAt("add", jest.fn())} />, await createTestRuntime());
    expect(screen.getByRole("tab", { name: en("nav.now"), selected: true })).toBeOnTheScreen();
  });
});

/** Shows a toast once mounted. */
const Toasts = () => {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message: "Deleted" });
  }, [toast]);
  return null;
};

const TAB_BAR_HEIGHT = 81;

/** The bar lays itself out at its measured height (64 + the bottom inset, say). */
const layOutBar = async (): Promise<void> => {
  await fireEvent(screen.getByTestId("tab-bar"), "layout", {
    nativeEvent: { layout: { height: TAB_BAR_HEIGHT, width: 390, x: 0, y: 763 } },
  });
};

const toastBottom = (): number | undefined =>
  StyleSheet.flatten(screen.getByTestId("toast-place").props["style"] as ViewStyle).bottom as
    | number
    | undefined;

describe("TabBar and the toast layer (spec §4.1.4, F-CMP-12)", () => {
  it("tells the layer its measured height: a toast floats space.3 above it, never at a constant", async () => {
    await renderScreen(
      <>
        <TabBar {...propsAt("index", jest.fn())} />
        <Toasts />
      </>,
      await createTestRuntime(),
    );
    await layOutBar();
    expect(toastBottom()).toBe(TAB_BAR_HEIGHT + space["3"]);
  });

  it("lifts nothing while a screen is pushed over the tabs (the bar is mounted, out of sight)", async () => {
    await renderScreen(
      <>
        <TabBar {...propsAt("index", jest.fn(), false)} />
        <Toasts />
      </>,
      await createTestRuntime(),
    );
    await layOutBar();
    expect(toastBottom()).toBe(space["3"]);
  });
});

describe("TabBar's look (spec §4.2.27)", () => {
  it("marks the current tab with the pill and the weight, not colour alone (F-AND-02)", async () => {
    await renderScreen(<TabBar {...propsAt("day", jest.fn())} />, await createTestRuntime());
    expect(screen.getAllByTestId("tab-pill-current")).toHaveLength(1);
    const day = screen.getByRole("tab", { name: en("nav.day"), selected: true });
    expect(within(day).getByTestId("tab-pill-current").props["className"]).toContain("bg-fill-3");
    expect(within(day).getByText(en("nav.day")).props["className"]).toContain("font-semibold");
  });

  it("lets a long name wrap instead of cutting it (RU at the largest font scale)", async () => {
    await renderScreen(<TabBar {...propsAt("index", jest.fn())} />, await createTestRuntime());
    expect(screen.getByText(en("nav.more")).props["numberOfLines"]).toBeUndefined();
  });
});

/**
The current tab's press is meant to change nothing (the screen is already there); every other
tab must navigate (bug class 10).
*/
const ALREADY_THERE = [`tab "${en("nav.now")}"`];

describe("every control of the tab bar does something (bug class 10)", () => {
  it("each tab navigates", async () => {
    const navigate = jest.fn();
    expect(
      await deadControls(async () => {
        navigate.mockClear();
        await renderScreen(<TabBar {...propsAt("index", navigate)} />, await createTestRuntime());
        return { extra: () => navigate.mock.calls.length };
      }, ALREADY_THERE),
    ).toEqual([]);
  });
});
