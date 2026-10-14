import { fireEvent, screen, within } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";

import { useNewTaskRequest } from "#app/shared/new-task-request.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeUser } from "@pace/client/testing";

import { Sidebar } from "./sidebar.tsx";

const linkNames = (): readonly string[] =>
  screen.getAllByRole("link").map((link) => link.props["accessibilityLabel"] as string);

/** Stands in for Now's composer: counts the forms it was asked to open. */
const NowStandIn = () => {
  const [opened, setOpened] = useState(0);
  useNewTaskRequest(() => {
    setOpened((count) => count + 1);
  });
  return <Text>{`forms opened: ${String(opened)}`}</Text>;
};

describe("Sidebar", () => {
  it("asks Now in front for the empty form on New task, rather than reloading it", async () => {
    await renderScreen(
      <>
        <Sidebar />
        <NowStandIn />
      </>,
      await createTestRuntime({ world: "empty" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    expect(screen.getByText("forms opened: 1")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    expect(screen.getByText("forms opened: 2")).toBeOnTheScreen();
    // Already on Now (the test router's path): nothing to navigate to.
    expect(router.navigate).not.toHaveBeenCalled();
  });

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
