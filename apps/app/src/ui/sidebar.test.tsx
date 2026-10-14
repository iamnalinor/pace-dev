import { screen, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeUser } from "@pace/client/testing";

import { Sidebar } from "./sidebar.tsx";

const linkNames = (): readonly string[] =>
  screen.getAllByRole("link").map((link) => link.props["accessibilityLabel"] as string);

describe("Sidebar", () => {
  it("lists the destinations in the owner's order, Calendar after Day", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    expect(linkNames()).toEqual([
      en("nav.now"),
      en("nav.day"),
      en("nav.calendar"),
      en("nav.inbox"),
      en("nav.projects"),
      en("nav.insights"),
      en("nav.history"),
      en("nav.settings"),
    ]);
  });

  it("counts what waits in the Inbox on its row, the captures and the decisions together", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime());
    const inbox = screen.getByRole("link", { name: en("nav.inboxWaiting", { count: 4 }) });
    expect(within(inbox).getByText("4")).toBeOnTheScreen();
    expect(screen.getAllByTestId("count-badge")).toHaveLength(1);
  });

  it("shows no badge when nothing waits", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByTestId("count-badge")).toBeNull();
    expect(screen.getByRole("link", { name: en("nav.inbox") })).toBeTruthy();
  });

  it("shows the owner's first name beside the app's name", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(<Sidebar />, runtime);
    expect(screen.getByText(en("app.name"))).toBeOnTheScreen();
    expect(screen.getByText("Ann")).toBeOnTheScreen();
  });

  it("falls back to the first word of the full name for a session that predates the first name", async () => {
    const runtime = await createTestRuntime({
      routes: { "GET /api/me": () => ({ ...fakeUser, firstName: null, name: "Ann Lee" }) },
      world: "empty",
    });
    await runtime.auth.me();
    await renderScreen(<Sidebar />, runtime);
    expect(screen.getByText("Ann")).toBeOnTheScreen();
  });

  it("leaves the name out until the server has told it", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByText("Ann")).toBeNull();
  });
});
