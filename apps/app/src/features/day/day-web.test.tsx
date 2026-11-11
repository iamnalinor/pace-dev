import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { fakeUser, problem } from "@pace/client/testing";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { DayScreen } from "./day-screen.tsx";

// The web build: no phone sections, and no screen time of its own.
jest.mock("#app/platform/device.ts", () => ({ IS_PHONE: false }));

// The file's first render compiles Day for the web build: under a full parallel run it takes more
// than the default 5 s on its own.
jest.setTimeout(20_000);

const LAPTOP = {
  app: "code",
  deviceId: "01LAPTOP",
  deviceName: "Laptop",
  endAt: addMinutesIso(NOW, -200),
  startAt: addMinutesIso(NOW, -250),
};

/** A route of a server that cannot be reached. */
const offline = (): never => {
  throw new TypeError("Failed to fetch");
};

describe("Day on the web: screen time only for what a phone or a computer sent (QA PR55-1-08)", () => {
  it("shows no screen time section on a day nothing was sent for", async () => {
    const usage = jest.fn(() => ({ sessions: [] }));
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    await waitFor(() => {
      expect(usage).toHaveBeenCalled();
    });
    expect(screen.queryByText(en("day.screenTime"))).toBeNull();
    expect(screen.queryByText(en("day.noApps"))).toBeNull();
  });

  it("shows a computer's screen time when it sent some", async () => {
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": () => ({ sessions: [LAPTOP] }) } }),
    );
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    expect(screen.getByText(en("day.screenTime"))).toBeOnTheScreen();
  });

  it("offers no retry for screen time that was never there to load", async () => {
    const usage = jest.fn(() => ({ sessions: [] }));
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    await waitFor(() => {
      expect(usage).toHaveBeenCalled();
    });
    expect(screen.queryByText(en("day.screenTimeFailed"))).toBeNull();
    expect(screen.queryByRole("button", { name: en("common.retry") })).toBeNull();
  });

  // A computer may have sent screen time: a failed read is not "nothing recorded" (R23-08,
  // class 371), so the web says it did not load, and offers its Try again.
  it("says screen time did not load when the read failed, and reads it again on Try again", async () => {
    const network = { isUp: false };
    const usage = jest.fn(() => (network.isUp ? { sessions: [LAPTOP] } : problem(503, "offline")));
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    expect(await screen.findByText(en("day.screenTimeFailed"))).toBeOnTheScreen();
    network.isUp = true;
    await fireEvent.press(screen.getByRole("button", { name: en("common.retry") }));
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    expect(screen.queryByText(en("day.screenTimeFailed"))).toBeNull();
  });

  it("keeps one Retry while the sync line offers its own", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/sync/pull": offline,
        "GET /api/usage": offline,
        "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
      },
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(
      <SyncFrame isBare={false}>
        <DayScreen />
      </SyncFrame>,
      runtime,
    );
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    expect(await screen.findByText(en("day.screenTimeFailed"))).toBeOnTheScreen();
    expect(screen.queryAllByRole("button", { name: en("sync.retry") })).toHaveLength(1);
  });
});
