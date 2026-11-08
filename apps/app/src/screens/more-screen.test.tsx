import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { MoreScreen } from "./more-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MoreScreen", () => {
  it("lists Week, Projects, Insights, History and Settings, each opening its page", async () => {
    await renderScreen(<MoreScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getAllByRole("link")).toHaveLength(5);
    for (const key of [
      "nav.week",
      "nav.projects",
      "nav.insights",
      "nav.history",
      "nav.settings",
    ] as const) {
      expect(screen.getByRole("link", { name: en(key) })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole("link", { name: en("nav.history") }));
    expect(router.navigate).toHaveBeenCalledWith("/history");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.settings") }));
    expect(router.navigate).toHaveBeenCalledWith("/settings");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.projects") }));
    expect(router.navigate).toHaveBeenCalledWith("/projects");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.insights") }));
    expect(router.navigate).toHaveBeenCalledWith("/insights");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.week") }));
    expect(router.navigate).toHaveBeenCalledWith("/week");
  });

  it("shows no profile name (owner 2026-11-08: Settings says who is signed in)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(<MoreScreen />, runtime);
    expect(screen.queryByText("Ann")).toBeNull();
  });
});
