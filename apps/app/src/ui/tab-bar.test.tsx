import type { ComponentProps } from "react";

import { fireEvent, screen, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TabBar } from "./tab-bar.tsx";

// jest renders the phone, where Space is no key; the web's handler is the one under test here.
jest.mock("./space-press.ts", (): unknown => jest.requireActual("./space-press.web.ts"));

type Props = ComponentProps<typeof TabBar>;

const ROUTES = ["index", "day", "inbox", "more", "add"] as const;

const TITLES: Readonly<Record<(typeof ROUTES)[number], string>> = {
  add: en("nav.add"),
  day: en("nav.day"),
  inbox: en("nav.inbox"),
  index: en("nav.now"),
  more: en("nav.more"),
};

const propsAt = (current: (typeof ROUTES)[number], navigate: jest.Mock): Props =>
  ({
    descriptors: Object.fromEntries(
      ROUTES.map((name) => [name, { options: { title: TITLES[name] } }]),
    ),
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
    expect(navigate).toHaveBeenCalledWith("more", undefined);
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
    const anchor = screen.getByTestId("count-badge").parent?.props["className"] as string;
    const classes = anchor.split(" ");
    expect(classes).toContain("left-5");
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
