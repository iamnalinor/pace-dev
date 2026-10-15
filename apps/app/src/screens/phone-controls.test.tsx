import type { ReactElement } from "react";

import { DayScreen } from "#app/features/day/day-screen.tsx";
import { DevicesScreen } from "#app/features/devices/devices-screen.tsx";
import { WeekScreen } from "#app/features/week/week-screen.tsx";
import { deadControls } from "#app/test/dead-controls.ts";
import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { InboxScreen } from "./inbox-screen.tsx";
import { MoreScreen } from "./more-screen.tsx";
import { NowScreen } from "./now-screen.tsx";
import { SettingsScreen } from "./settings-screen.tsx";

/*
Bug class 10: every enabled control on a phone-layout screen does something visible when
pressed. Each screen is rendered on the artboard's lived-in world (tasks, captures, projects,
activities), with the store's log as what a press may change besides the screen.
*/

/** Renders `ui` on a fresh artboard runtime; the store's log length is what a write changes. */
const onArtboard = (ui: ReactElement) => async () => {
  const runtime = await createTestRuntime();
  await renderScreen(ui, runtime);
  return { extra: () => runtime.state.store.getState().log.length };
};

/** Devices with a server that lists none and makes one. */
const devices = async () => {
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/devices": () => ({ devices: [] }),
      "POST /api/devices": () => ({ id: "01NEW", name: "My computer", token: "tok" }),
    },
  });
  await renderScreen(<DevicesScreen />, runtime);
  return { extra: () => runtime.state.store.getState().log.length };
};

jest.setTimeout(120_000);

/**
Controls whose result is outside the app, so nothing on the screen changes: Day's usage access
opens Android's settings page (the screen reads the permission again on the way back).
*/
const OUTSIDE_THE_APP = [
  'button without a label, showing "Allow usage access to see your sleep and"',
];

describe("every control on a phone screen does something", () => {
  it.each([
    ["Now", <NowScreen key="now" />],
    ["Day", <DayScreen key="day" />],
    ["Inbox", <InboxScreen key="inbox" />],
    ["More", <MoreScreen key="more" />],
    ["Settings", <SettingsScreen key="settings" />],
    ["Week", <WeekScreen key="week" />],
  ])("%s", async (_name, ui) => {
    expect(await deadControls(onArtboard(ui), OUTSIDE_THE_APP)).toEqual([]);
  });

  it("Devices, where Add a computer once did nothing on phones", async () => {
    expect(await deadControls(devices)).toEqual([]);
  });
});
