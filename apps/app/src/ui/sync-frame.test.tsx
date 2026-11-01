import { act, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { FAKE_STORE_ID, fakeUser } from "@pace/client/testing";

import { FirstSyncCover, OfflineFrame } from "./sync-frame.tsx";

const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: FAKE_STORE_ID };

/** Signs in with a session token, as a real sign-in does (the account's language waits for it). */
const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };

/** A pull the test answers when it chooses: the first sync, held. */
const heldPull = () => {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  return { answer: resolve, route: async () => await promise };
};

const App = () => (
  <OfflineFrame>
    <FirstSyncCover isBare={false}>
      <Text>{en("now.empty")}</Text>
    </FirstSyncCover>
  </OfflineFrame>
);

describe("FirstSyncCover (QA round 17 M4)", () => {
  it("shows no empty copy while an empty copy waits for its first sync, then the screen", async () => {
    const pull = heldPull();
    const runtime = await createTestRuntime({
      routes: { ...DEV_LOGIN, "GET /api/sync/pull": pull.route },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(screen.getByRole("progressbar", { name: en("sync.firstSync") })).toBeOnTheScreen();
    expect(screen.queryByText(en("now.empty"))).toBeNull();
    await act(async () => {
      pull.answer(EMPTY_PAGE);
      await Promise.resolve();
    });
    expect(await screen.findByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("never covers a copy that already holds the log", async () => {
    const pull = heldPull();
    const runtime = await createTestRuntime({ routes: { "GET /api/sync/pull": pull.route } });
    await runtime.auth.me();
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("gives way to the offline line when the first sync cannot reach the server (M5)", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/sync/pull": () => {
          throw new TypeError("Failed to fetch");
        },
      },
      world: "empty",
    });
    await runtime.auth.me();
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("OfflineFrame (QA round 17 M5)", () => {
  it("says the device is offline while the sync cannot reach the server, and clears once it can", async () => {
    const network = { isDown: true };
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/sync/pull": () => {
          if (network.isDown) {
            throw new TypeError("Failed to fetch");
          }
          return EMPTY_PAGE;
        },
      },
    });
    await runtime.auth.me();
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    network.isDown = false;
    await act(async () => {
      await runtime.sync.syncNow();
    });
    await waitFor(() => {
      expect(screen.queryByText(en("errors.offline"))).toBeNull();
    });
  });
});
