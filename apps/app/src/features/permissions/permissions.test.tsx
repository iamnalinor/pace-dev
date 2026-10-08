import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus, Linking } from "react-native";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { OnboardingScreen } from "./onboarding-screen.tsx";
import { PermissionsScreen } from "./permissions-screen.tsx";

const mockPhone = { exactAlarms: false, usage: false };

jest.mock("../../../modules/pace-native/index.ts", () => ({
  paceNative: {
    canScheduleExactAlarms: () => mockPhone.exactAlarms,
    hasUsageAccess: () => mockPhone.usage,
    openExactAlarmSettings: jest.fn(),
    openUsageAccessSettings: jest.fn(),
  },
}));

type FakeNotifications = { state: { granted: boolean; canAskAgain: boolean } };

const calendar = Calendar as unknown as FakeCalendar;
const notifications = Notifications as unknown as FakeNotifications;

/** AppState listeners, called as if the person came back from Android settings. */
const listeners: ((state: AppStateStatus) => void)[] = [];

const comeBack = async (): Promise<void> => {
  await act(async () => {
    for (const listener of listeners) {
      listener("active");
    }
    await Promise.resolve();
  });
};

beforeEach(() => {
  (SecureStore as unknown as FakeSecureStore).values.clear();
  mockPhone.exactAlarms = false;
  mockPhone.usage = false;
  notifications.state.granted = false;
  notifications.state.canAskAgain = true;
  calendar.state.status = "undetermined";
  calendar.state.canAskAgain = true;
  listeners.length = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: () => undefined };
  });
  router.replace.mockClear();
});

describe("Settings → Permissions", () => {
  it("shows each permission's state and turns one on from its card", async () => {
    calendar.state.status = "denied";
    calendar.state.canAskAgain = false;
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    await renderScreen(<PermissionsScreen />, await createTestRuntime());

    const notificationsCard = await screen.findByLabelText("Notifications");
    expect(within(notificationsCard).getByText("Off")).toBeOnTheScreen();
    await fireEvent.press(within(notificationsCard).getByRole("button", { name: "Allow" }));
    expect(await within(notificationsCard).findByText("On")).toBeOnTheScreen();

    // Refused for good: only the app's own settings page can turn it back on.
    const calendarCard = screen.getByLabelText("Calendar");
    expect(within(calendarCard).getByText("Turned off in Android settings")).toBeOnTheScreen();
    await fireEvent.press(within(calendarCard).getByRole("button", { name: "Open settings" }));
    expect(openSettings).toHaveBeenCalled();

    const usageCard = screen.getByLabelText("Usage access");
    await fireEvent.press(within(usageCard).getByRole("button", { name: "Open settings" }));
    mockPhone.usage = true;
    await comeBack();
    expect(await within(usageCard).findByText("On")).toBeOnTheScreen();
  });
});

describe("the first-run onboarding", () => {
  it("explains every permission, then asks for each one that is off, in turn", async () => {
    await renderScreen(<OnboardingScreen />, await createTestRuntime());
    expect(await screen.findByText("A few permissions")).toBeOnTheScreen();
    expect(screen.getByText("Usage access")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("1 of 4")).toBeOnTheScreen();
    expect(screen.getByText("Notifications")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Allow" }));

    expect(await screen.findByText("2 of 4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Allow" }));
    expect(calendar.state.status).toBe("granted");

    // A settings screen: the step waits until the person is back with it turned on.
    expect(await screen.findByText("3 of 4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByText("3 of 4")).toBeOnTheScreen();
    mockPhone.usage = true;
    await comeBack();

    expect(await screen.findByText("4 of 4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect((SecureStore as unknown as FakeSecureStore).values.get("pace.onboarding.v1")).toBe(
      "done",
    );
  });

  it("can be put off, and is not shown again", async () => {
    await renderScreen(<OnboardingScreen />, await createTestRuntime());
    await fireEvent.press(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect((SecureStore as unknown as FakeSecureStore).values.get("pace.onboarding.v1")).toBe(
      "done",
    );
  });
});
