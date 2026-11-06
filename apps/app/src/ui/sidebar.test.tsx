import { fireEvent, screen, within } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";

import { useNewTaskRequest } from "#app/shared/new-task-request.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeMe } from "@pace/client/testing";

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
  it("sits on the sidebar ground, a step off the page (bg.sidebar, not bg.app)", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    const classes = (screen.getByLabelText(en("nav.main")).props["className"] as string).split(" ");
    expect(classes).toContain("bg-sidebar");
    expect(classes).not.toContain("bg-app");
  });

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

  it("lists the destinations in the owner's order, Week after Day", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    expect(linkNames()).toEqual([
      en("nav.now"),
      en("nav.day"),
      en("nav.week"),
      en("nav.inbox"),
      en("nav.projects"),
      en("nav.insights"),
      en("nav.history"),
      en("nav.settings"),
    ]);
  });

  it("hands each destination's address to its link (navigate, not push, is the kit Link's: link.test; the web's `<a href>`: link.web.test, e2e/link)", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("link", { name: en("nav.week") }));
    expect(router.navigate).toHaveBeenCalledWith("/week");
    expect(router.push).not.toHaveBeenCalled();
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
      routes: { "GET /api/me": () => ({ ...fakeMe, firstName: null, name: "Ann Lee" }) },
      world: "empty",
    });
    await runtime.auth.me();
    await renderScreen(<Sidebar />, runtime);
    expect(screen.getByText("Ann")).toBeOnTheScreen();
  });

  it("gives a 64-character Telegram name a line of its own, cut at its end only, never to one letter (F-LAY-06)", async () => {
    const long = "Александр-Константин Длинноимённый Тестовый Пользователь Telegram";
    expect(long.length).toBeGreaterThanOrEqual(64);
    const runtime = await createTestRuntime({
      routes: { "GET /api/me": () => ({ ...fakeMe, firstName: long, name: long }) },
      world: "empty",
    });
    await runtime.auth.me();
    await renderScreen(<Sidebar />, runtime);
    const name = screen.getByText(long);
    // One line ending in "…" (the whole name in its tooltip and its label), never a letter.
    expect(name.props["numberOfLines"]).toBe(1);
    const row = screen.getByTestId("sidebar-owner");
    expect(within(row).queryByText(en("app.name"))).toBeNull();
    expect(within(row).queryByLabelText(/notification/iu)).toBeNull();
    expect(row.props["accessibilityLabel"]).toBe(en("nav.signedInAs", { name: long }));
    // No avatar beside it repeating the initial (R22-25): the name has the row's whole width.
    expect(within(row).queryByTestId("avatar-person")).toBeNull();
    expect(name.props["className"]).toContain("flex-1");
  });

  it("leaves the name out until the server has told it", async () => {
    await renderScreen(<Sidebar />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByText("Ann")).toBeNull();
  });
});
