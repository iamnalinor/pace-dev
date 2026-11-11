import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { Shell } from "./shell.web.tsx";

describe("Shell on the web (spec §4.2.18: main landmark and skip link, F-A11Y-12)", () => {
  it("makes the content the page's main landmark, with a skip link before it", async () => {
    await renderScreen(
      <Shell content={<Text>List</Text>} navigation={<Text>Nav</Text>} />,
      await createTestRuntime({ world: "empty" }),
    );
    const main = screen.getByTestId("shell-content");
    expect(main.props["role"]).toBe("main");
    // Pressing it moves focus into main (the DOM half is `e2e/layout.e2e.ts`); here it must not throw.
    await fireEvent.press(screen.getByRole("link", { name: en("nav.skipToContent") }));
    expect(main).toBeOnTheScreen();
  });

  it("the app's shell on a phone (no navigation region) is still main, with the skip link", async () => {
    await renderScreen(
      <Shell content={<Text>List</Text>} isRoot />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.getByTestId("shell-content").props["role"]).toBe("main");
    expect(screen.getByRole("link", { name: en("nav.skipToContent") })).toBeOnTheScreen();
  });

  it("a nested shell (a screen's inspector) is no second landmark and has no skip link", async () => {
    await renderScreen(
      <Shell content={<Text>Grid</Text>} />,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.getByTestId("shell-content").props["role"]).toBeUndefined();
    expect(screen.queryByRole("link", { name: en("nav.skipToContent") })).toBeNull();
  });
});
