import { screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { type NavCurrent, NavItem } from "./nav-item.tsx";
import { currentOf, DESTINATIONS } from "./sidebar.tsx";

const renderItem = async (current: NavCurrent) => {
  await renderScreen(
    <NavItem
      count={0}
      current={current}
      href="/settings"
      icon="settings"
      label="Settings"
      title="Settings"
    />,
    await createTestRuntime({ world: "empty" }),
  );
  return screen.getByRole("link", { name: "Settings" });
};

const classesOf = (element: ReturnType<typeof screen.getByRole>): readonly string[] =>
  String(element.props["className"]).split(" ");

describe("NavItem (spec §4.2.22)", () => {
  it("marks its own page with the fill, the 4 px bar of a selected ListRow and aria-current=page", async () => {
    const link = await renderItem("page");
    expect(link.props["aria-current"]).toBe("page");
    expect(classesOf(link)).toContain("bg-fill-3");
    expect(within(link).getByTestId("list-row-selected-bar")).toBeOnTheScreen();
  });

  it("on a screen it owns but does not name (Presets under Settings) keeps the bar, not the fill, and claims no page (R23-14)", async () => {
    const link = await renderItem("section");
    expect(link.props["aria-current"]).toBe("true");
    expect(classesOf(link)).not.toContain("bg-fill-3");
    expect(within(link).getByTestId("list-row-selected-bar")).toBeOnTheScreen();
  });

  it("elsewhere is a plain link", async () => {
    const link = await renderItem(null);
    expect(link.props["aria-current"]).toBeUndefined();
    expect(within(link).queryByTestId("list-row-selected-bar")).toBeNull();
  });

  it("is at least the web's 44 px target high", async () => {
    expect(classesOf(await renderItem(null))).toContain("min-h-hit-web");
  });
});

describe("which destination is where the person is", () => {
  const settings = DESTINATIONS.find((destination) => destination.href === "/settings");
  const now = DESTINATIONS.find((destination) => destination.href === "/");

  it.each([
    ["/settings", "page"],
    ["/presets", "section"],
    ["/presets/new", "section"],
    ["/week", null],
  ] as const)("Settings on %s: %s", (path, expected) => {
    expect(settings === undefined ? "missing" : currentOf(settings, path)).toBe(expected);
  });

  it.each([
    ["/", "page"],
    ["/add", "page"],
    ["/task/01ARZ3NDEKTSV4RRFFQ69G5FAV", "section"],
  ] as const)("Now on %s: %s", (path, expected) => {
    expect(now === undefined ? "missing" : currentOf(now, path)).toBe(expected);
  });
});
