import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { FAKE_STORE_ID, fakeUser, problem } from "@pace/client/testing";

import { HistoryScreen } from "./history-screen.tsx";

const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };
const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: FAKE_STORE_ID };

/** Every control that tries the server again, the sync line's and the screen's alike. */
const retries = () => screen.queryAllByRole("button", { name: en("sync.retry") });

describe("History after a first sync that failed (QA PR55-1-02)", () => {
  it.each([
    [
      "cannot reach the server",
      () => {
        throw new TypeError("Failed to fetch");
      },
      "actionError.history/offline",
    ],
    [
      "is answered with an error",
      () => problem(500, "internal"),
      "actionError.history/unavailable",
    ],
  ] as const)(
    "says so in the page when the pull %s, with one way to try again, then shows the history",
    async (_name, pull, message) => {
      const network = { pull: pull as () => unknown };
      const runtime = await createTestRuntime({
        routes: { ...DEV_LOGIN, "GET /api/sync/pull": () => network.pull() },
        world: "empty",
      });
      await runtime.auth.loginWithDev("1");
      await renderScreen(
        <SyncFrame isBare={false}>
          <HistoryScreen />
        </SyncFrame>,
        runtime,
      );
      // Not grey rows for good: the page says the history did not load.
      expect(await screen.findByText(en(message))).toBeOnTheScreen();
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(retries()).toHaveLength(1);
      network.pull = () => EMPTY_PAGE;
      const [retry] = retries();
      if (retry === undefined) {
        throw new Error("no Retry");
      }
      await fireEvent.press(retry);
      expect(await screen.findByText(en("history.events"))).toBeOnTheScreen();
      expect(screen.queryByText(en(message))).toBeNull();
    },
  );
});
