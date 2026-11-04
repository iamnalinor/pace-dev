import type { ComponentProps } from "react";

import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TabBar } from "./tab-bar.tsx";

// jest renders the phone's build: the web's tab is the one under test here.
jest.mock("./tab-bar-item.tsx", (): unknown => jest.requireActual("./tab-bar-item.web.tsx"));

type Props = ComponentProps<typeof TabBar>;

const ROUTES = ["index", "day", "inbox", "more"] as const;

const propsAt = (current: (typeof ROUTES)[number]): Props =>
  ({
    descriptors: Object.fromEntries(
      ROUTES.map((name) => [
        name,
        { options: { title: en(name === "index" ? "nav.now" : `nav.${name}`) } },
      ]),
    ),
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
    state: {
      index: ROUTES.indexOf(current),
      routes: ROUTES.map((name) => ({ key: name, name, params: undefined })),
    },
  }) as unknown as Props;

describe("TabBar on the phone's web (spec §4.2.27, F-A11Y-11)", () => {
  it("is a navigation landmark of links with addresses, not a tablist", async () => {
    await renderScreen(<TabBar {...propsAt("index")} />, await createTestRuntime());
    expect(screen.getByLabelText(en("nav.main")).props["role"]).toBe("navigation");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.props["href"] as string)).toEqual([
      "/",
      "/day",
      "/inbox",
      "/more",
    ]);
  });

  it("says aria-current=page on the current tab only", async () => {
    await renderScreen(<TabBar {...propsAt("day")} />, await createTestRuntime());
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.props["aria-current"] === "page");
    expect(current.map((link) => link.props["accessibilityLabel"] as string)).toEqual([
      en("nav.day"),
    ]);
  });
});
