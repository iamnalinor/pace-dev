import { fireEvent, screen } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { PhoneDataRow } from "./phone-data-row.tsx";

const calendar = Calendar as unknown as FakeCalendar;

describe("PhoneDataRow", () => {
  it("shows each access as off with the way to turn it on, and turns the calendar on", async () => {
    calendar.state.status = "undetermined";
    calendar.state.canAskAgain = true;
    await renderScreen(<PhoneDataRow />, await createTestRuntime());
    expect(screen.getByText("Usage access: sleep and time in apps")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open Android settings" })).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Allow" }));
    expect(await screen.findByText("On")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  });
});
