import { screen, within } from "@testing-library/react-native";
import { Text } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";

import { Navigation } from "./navigation.tsx";
import { Shell } from "./shell.tsx";

const renderShell = async (isInspectorOpen: boolean) =>
  await renderScreen(
    <Shell
      content={<Text>List</Text>}
      inspector={<Text>Details</Text>}
      inspectorLabel="Details pane"
      inspectorOpen={isInspectorOpen}
      navigation={<Navigation />}
    />,
    await createTestRuntime({ world: "empty" }),
  );

describe("Shell (spec §3.3, §5.0.1: navigation · content · inspector)", () => {
  describe("expanded (1440)", () => {
    withWindowWidth(1440);

    it("gives the content the full width while nothing is selected: no empty pane", async () => {
      await renderShell(false);
      expect(screen.queryByLabelText("Details pane")).toBeNull();
      expect(screen.queryByText("Details")).toBeNull();
      expect(String(screen.getByTestId("shell-content").props["className"])).toContain("flex-1");
    });

    it("opens the inspector at its width at the trailing edge when open", async () => {
      await renderShell(true);
      const inspector = screen.getByLabelText("Details pane");
      expect(inspector.props["role"]).toBe("region");
      expect(String(inspector.props["className"])).toContain("w-inspector");
      expect(screen.getByText("Details")).toBeOnTheScreen();
    });

    it("has the sidebar for navigation", async () => {
      await renderShell(false);
      expect(screen.getByLabelText(en("nav.main")).props["role"]).toBe("navigation");
      expect(screen.queryByTestId("nav-rail")).toBeNull();
    });
  });

  describe("medium (800)", () => {
    withWindowWidth(800);

    it("renders the navigation rail, with every destination as a link", async () => {
      await renderShell(false);
      expect(screen.getByTestId("nav-rail")).toBeOnTheScreen();
      // The destinations scroll: a phone turned sideways (about 390 high) cannot show all eight.
      expect(within(screen.getByTestId("nav-rail-scroll")).getAllByRole("link")).toHaveLength(8);
    });

    it("has no inspector region: a selection opens a sheet instead", async () => {
      await renderShell(true);
      expect(screen.queryByLabelText("Details pane")).toBeNull();
    });
  });

  describe("compact (390)", () => {
    it("has no navigation region of its own: the tab bar belongs to the tabs", async () => {
      await renderShell(true);
      expect(screen.queryByLabelText(en("nav.main"))).toBeNull();
      expect(screen.queryByLabelText("Details pane")).toBeNull();
      expect(screen.getByText("List")).toBeOnTheScreen();
    });
  });
});
