import { screen } from "@testing-library/react-native";

import type { TimeButtonView } from "@pace/client";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import type { CalendarToday } from "./calendar-today.ts";

import { ChoicesSheet } from "./choices-sheet.tsx";

const CALENDAR: TimeButtonView = {
  category: "other",
  choices: [],
  color: "slate",
  id: "calendar",
  isRunning: false,
  kind: "calendar",
  labelKey: "time.button.calendar",
};

const sheet = (calendar: CalendarToday | null) => (
  <ChoicesSheet button={CALENDAR} calendar={calendar} canGoAlongside={false} onClose={jest.fn()} />
);

const permissions = () => screen.queryByRole("button", { name: en("permissions.title") });

describe("ChoicesSheet for Calendar on the phone", () => {
  it("offers no Permissions before the calendar was read: nothing is known about access yet", async () => {
    await renderScreen(sheet(null), await createTestRuntime());
    expect(permissions()).toBeNull();
  });

  it("offers no Permissions with access granted", async () => {
    await renderScreen(sheet({ access: "granted", events: [] }), await createTestRuntime());
    expect(permissions()).toBeNull();
  });

  it("offers Permissions once access is known to be refused", async () => {
    await renderScreen(sheet({ access: "denied", events: [] }), await createTestRuntime());
    expect(permissions()).toBeOnTheScreen();
  });
});
