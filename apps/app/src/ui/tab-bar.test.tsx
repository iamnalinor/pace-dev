import type { ComponentProps } from "react";

import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TabBar } from "./tab-bar.tsx";

type Props = ComponentProps<typeof TabBar>;

const ROUTES = ["index", "day", "projects", "insights", "settings", "add"] as const;

const TITLES: Readonly<Record<(typeof ROUTES)[number], string>> = {
  add: en("nav.add"),
  day: en("nav.day"),
  index: en("nav.now"),
  insights: en("nav.insights"),
  projects: en("nav.projects"),
  settings: en("nav.settings"),
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
  it("offers Settings instead of a + that only focused the composer", async () => {
    const navigate = jest.fn();
    await renderScreen(<TabBar {...propsAt("index", navigate)} />, await createTestRuntime());
    const tabs = screen.getAllByRole("tab").map((tab) => tab.props["accessibilityLabel"] as string);
    expect(tabs).toEqual([
      en("nav.now"),
      en("nav.day"),
      en("nav.projects"),
      en("nav.insights"),
      en("nav.settings"),
    ]);
    await fireEvent.press(screen.getByRole("tab", { name: en("nav.settings") }));
    expect(navigate).toHaveBeenCalledWith("settings", undefined);
  });

  it("keeps Now selected on New task (the composer on Now)", async () => {
    await renderScreen(<TabBar {...propsAt("add", jest.fn())} />, await createTestRuntime());
    expect(screen.getByRole("tab", { name: en("nav.now"), selected: true })).toBeOnTheScreen();
  });
});
