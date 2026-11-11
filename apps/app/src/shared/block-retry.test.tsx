import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { DayScreen } from "#app/features/day/day-screen.tsx";
import { WeekScreen } from "#app/features/week/week-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { FAKE_STORE_ID, fakeUser } from "@pace/client/testing";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };
const LAPTOP = {
  app: "code",
  deviceId: "01LAPTOP",
  deviceName: "Laptop",
  endAt: addMinutesIso(NOW, -200),
  startAt: addMinutesIso(NOW, -250),
};

/** Every control that tries again, the sync line's and a section's alike («Try again»). */
const retries = () => screen.queryAllByRole("button", { name: en("sync.retry") });

/** A signed-in copy whose server cannot be reached until `network.isUp`. */
const offlineWorld = async () => {
  const network = { isUp: false };
  const offline =
    <T,>(answer: () => T) =>
    (): T => {
      if (!network.isUp) {
        throw new TypeError("Failed to fetch");
      }
      return answer();
    };
  const runtime = await createTestRuntime({
    routes: {
      ...DEV_LOGIN,
      "GET /api/calendar": offline(() => ({ events: [] })),
      "GET /api/sync/pull": offline(() => ({
        events: [],
        more: false,
        seq: 0,
        storeId: FAKE_STORE_ID,
      })),
      "GET /api/usage": offline(() => ({ sessions: [LAPTOP] })),
    },
  });
  await runtime.auth.loginWithDev("1");
  return { network, runtime };
};

const pressTheRetry = async () => {
  const [retry] = retries();
  if (retry === undefined) {
    throw new Error("no Retry");
  }
  await fireEvent.press(retry);
};

describe("one Retry for one offline state (QA PR55-1-09)", () => {
  it("Day: screen time says it did not load, the sync line's Retry reads it again", async () => {
    const { network, runtime } = await offlineWorld();
    await renderScreen(
      <SyncFrame isBare={false}>
        <DayScreen />
      </SyncFrame>,
      runtime,
    );
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    expect(await screen.findByText(en("day.screenTimeFailed"))).toBeOnTheScreen();
    expect(retries()).toHaveLength(1);
    network.isUp = true;
    await pressTheRetry();
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    expect(screen.queryByText(en("day.screenTimeFailed"))).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it("Week: the calendar says it did not load, the sync line's Retry reads it again", async () => {
    const { network, runtime } = await offlineWorld();
    await renderScreen(
      <SyncFrame isBare={false}>
        <WeekScreen />
      </SyncFrame>,
      runtime,
    );
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    expect(await screen.findByText(en("week.calendarFailed"))).toBeOnTheScreen();
    expect(retries()).toHaveLength(1);
    network.isUp = true;
    await pressTheRetry();
    await waitFor(() => {
      expect(screen.queryByText(en("week.calendarFailed"))).toBeNull();
    });
    expect(retries()).toHaveLength(0);
  });
});
