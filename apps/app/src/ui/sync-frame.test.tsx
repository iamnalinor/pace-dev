import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AppState, Text } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { FAKE_STORE_ID, fakeUser, problem } from "@pace/client/testing";

import { EmptyState, EmptyText } from "./empty-state.tsx";
import { backOnline, FIRST_SYNC_COVER_MS, SyncFrame } from "./sync-frame.tsx";

const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: FAKE_STORE_ID };

/** Signs in with a session token, as a real sign-in does (the account's language waits for it). */
const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };

/** A pull the test answers when it chooses: the first sync, held. */
const heldPull = () => {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  return { answer: resolve, route: async () => await promise };
};

const App = () => (
  <SyncFrame isBare={false}>
    <Text>{en("now.empty")}</Text>
  </SyncFrame>
);

describe("a server problem the composer hands in", () => {
  const serverProblem = {
    action: <Text>Ask again</Text>,
    message: "server.firebaseProjectMismatch",
  } as const;

  it("says it with the composer's control instead of the strip's own Retry", async () => {
    const runtime = await createTestRuntime();
    await runtime.auth.me();
    await renderScreen(
      <SyncFrame isBare={false} serverProblem={serverProblem}>
        <Text>{en("now.empty")}</Text>
      </SyncFrame>,
      runtime,
    );
    expect(screen.getByText(en("server.firebaseProjectMismatch"))).toBeOnTheScreen();
    expect(screen.getByText("Ask again")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: en("sync.retry") })).toBeNull();
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
  });

  it("says nothing on the bare screens (signing in has its own notice)", async () => {
    const runtime = await createTestRuntime();
    await runtime.auth.me();
    await renderScreen(
      <SyncFrame isBare serverProblem={serverProblem}>
        <Text>{en("now.empty")}</Text>
      </SyncFrame>,
      runtime,
    );
    expect(screen.queryByText(en("server.firebaseProjectMismatch"))).toBeNull();
  });
});

describe("the first-sync cover (QA round 17 M4)", () => {
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

  it("says in words that it is syncing, not only with grey rows (QA round 18 M5)", async () => {
    const pull = heldPull();
    const runtime = await createTestRuntime({
      routes: { ...DEV_LOGIN, "GET /api/sync/pull": pull.route },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(screen.getByText(en("sync.firstSyncLine"))).toBeOnTheScreen();
    expect(screen.getByRole("progressbar", { name: en("sync.firstSync") })).toBeOnTheScreen();
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
        ...DEV_LOGIN,
        "GET /api/sync/pull": () => {
          throw new TypeError("Failed to fetch");
        },
      },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

/** A screen's own empty states, as Now, Day and the others draw them. */
const Screens = () => (
  <SyncFrame isBare={false}>
    <EmptyState title={en("now.empty")} />
    <EmptyText className="">{en("day.empty")}</EmptyText>
  </SyncFrame>
);

describe("a first sync that failed on an empty copy (QA round 21 M4)", () => {
  it.each([
    ["answered with HTTP 500", () => problem(500, "internal"), "sync.notSyncedYet"],
    [
      "that cannot reach the server",
      () => {
        throw new TypeError("Failed to fetch");
      },
      "errors.offline",
    ],
  ] as const)(
    "%s keeps grey rows, never the final empty copy, under a line with Retry",
    async (_name, pull, line) => {
      const network = { pull: pull as () => unknown };
      const runtime = await createTestRuntime({
        routes: { ...DEV_LOGIN, "GET /api/sync/pull": () => network.pull() },
        world: "empty",
      });
      await runtime.auth.loginWithDev("1");
      await renderScreen(<Screens />, runtime);
      expect(await screen.findByText(en(line))).toBeOnTheScreen();
      expect(screen.queryByText(en("now.empty"))).toBeNull();
      expect(screen.queryByText(en("day.empty"))).toBeNull();
      expect(screen.getAllByRole("progressbar", { name: en("sync.loadingData") })).toHaveLength(2);
      // Retry asks again at once; once a pull answers, the screen says what it holds.
      network.pull = () => EMPTY_PAGE;
      await fireEvent.press(screen.getByRole("button", { name: en("sync.retry") }));
      expect(await screen.findByText(en("now.empty"))).toBeOnTheScreen();
      expect(screen.getByText(en("day.empty"))).toBeOnTheScreen();
      expect(screen.queryByText(en(line))).toBeNull();
      expect(screen.queryByRole("progressbar")).toBeNull();
    },
  );
});

describe("the first-sync cover's bound (QA round 17 review I2)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("gives the app back with a still-syncing line when the first pull never answers", async () => {
    jest.useFakeTimers();
    const pull = heldPull();
    const runtime = await createTestRuntime({
      routes: { ...DEV_LOGIN, "GET /api/sync/pull": pull.route },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(screen.getByRole("progressbar", { name: en("sync.firstSync") })).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(FIRST_SYNC_COVER_MS - 1);
      await Promise.resolve();
    });
    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.getByText(en("sync.stillSyncing"))).toBeOnTheScreen();
    // The pull answers at last: the line goes, the app stays.
    await act(async () => {
      pull.answer(EMPTY_PAGE);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText(en("sync.stillSyncing"))).toBeNull();
    });
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
  });

  it("shows no final empty copy after the cap while the first pull is not done (QA round 18 M5)", async () => {
    jest.useFakeTimers();
    const pull = heldPull();
    const runtime = await createTestRuntime({
      routes: { ...DEV_LOGIN, "GET /api/sync/pull": pull.route },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    // A screen's own empty state, as Now, Inbox and the others draw it.
    await renderScreen(
      <SyncFrame isBare={false}>
        <EmptyState title={en("now.empty")} />
        <EmptyText className="">{en("day.empty")}</EmptyText>
      </SyncFrame>,
      runtime,
    );
    await act(async () => {
      jest.advanceTimersByTime(FIRST_SYNC_COVER_MS);
      await Promise.resolve();
    });
    expect(screen.getByText(en("sync.stillSyncing"))).toBeOnTheScreen();
    expect(screen.queryByText(en("now.empty"))).toBeNull();
    expect(screen.queryByText(en("day.empty"))).toBeNull();
    expect(screen.getAllByRole("progressbar", { name: en("sync.loadingData") })).toHaveLength(2);
    await act(async () => {
      pull.answer(EMPTY_PAGE);
      await Promise.resolve();
    });
    expect(await screen.findByText(en("now.empty"))).toBeOnTheScreen();
    expect(screen.getByText(en("day.empty"))).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("covers the next sign-in's first sync though the last session's sync failed (review m5)", async () => {
    const network = {
      pull: (): Promise<unknown> => Promise.reject(new TypeError("Failed to fetch")),
    };
    const runtime = await createTestRuntime({
      routes: {
        ...DEV_LOGIN,
        "GET /api/sync/pull": async () => await network.pull(),
        "POST /api/auth/logout": () => ({ ok: true }),
      },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    const pull = heldPull();
    network.pull = pull.route;
    await act(async () => {
      await runtime.auth.logout();
    });
    await act(async () => {
      await runtime.auth.loginWithDev("1");
    });
    expect(
      await screen.findByRole("progressbar", { name: en("sync.firstSync") }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(en("now.empty"))).toBeNull();
    // Nothing from that session's sync says offline in this one yet.
    expect(screen.queryByText(en("errors.offline"))).toBeNull();
  });
});

describe("the offline line (QA round 17 M5)", () => {
  it("says the device is offline while the sync cannot reach the server, and clears once it can", async () => {
    const network = { isDown: true };
    const runtime = await createTestRuntime({
      routes: {
        ...DEV_LOGIN,
        "GET /api/sync/pull": () => {
          if (network.isDown) {
            throw new TypeError("Failed to fetch");
          }
          return EMPTY_PAGE;
        },
      },
    });
    await runtime.auth.loginWithDev("1");
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

describe("the offline line's Retry (QA round 20 L2)", () => {
  it("tries the server again at once instead of waiting out the backoff, and clears", async () => {
    const network = { isDown: true };
    const runtime = await createTestRuntime({
      routes: {
        ...DEV_LOGIN,
        "GET /api/sync/pull": () => {
          if (network.isDown) {
            throw new TypeError("Failed to fetch");
          }
          return EMPTY_PAGE;
        },
      },
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(<App />, runtime);
    expect(await screen.findByText(en("errors.offline"))).toBeOnTheScreen();
    network.isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: en("sync.retry") }));
    await waitFor(() => {
      expect(screen.queryByText(en("errors.offline"))).toBeNull();
    });
  });
});

describe("back on the network (QA round 17 review m9)", () => {
  const shown = Object.getOwnPropertyDescriptor(AppState, "currentState");
  afterEach(() => {
    jest.restoreAllMocks();
    if (shown !== undefined) {
      Object.defineProperty(AppState, "currentState", shown);
    }
  });

  it.each([
    ["visible", "active", 1],
    ["hidden", "background", 0],
  ] as const)(
    "in a %s tab syncs at once, and starts the socket only when seen",
    async (_name, state, starts) => {
      const runtime = await createTestRuntime({ routes: DEV_LOGIN });
      await runtime.auth.loginWithDev("1");
      // React Native's Jest setup makes `currentState` a mock function; the platform gives a string.
      Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
      const start = jest.spyOn(runtime.live, "start").mockImplementation(() => undefined);
      const sync = jest.spyOn(runtime.sync, "syncNow");
      backOnline(runtime);
      expect(start).toHaveBeenCalledTimes(starts);
      expect(sync).toHaveBeenCalledTimes(1);
    },
  );

  it("sends a Log out the server did not hear again, signed out too (R22-02)", async () => {
    const runtime = await createTestRuntime({ routes: DEV_LOGIN });
    const retry = jest.spyOn(runtime.auth, "retryEndedSessions");
    backOnline(runtime);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
