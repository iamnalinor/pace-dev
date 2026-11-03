import { AppState } from "react-native";

import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeUser } from "@pace/client/testing";

import { startSenders } from "./senders.ts";

describe("startSenders", () => {
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
    "in a %s tab starts the sync loop, and the socket only when seen (round 7 review minor)",
    async (_name, state, starts) => {
      const runtime = await createTestRuntime({
        routes: { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) },
      });
      await runtime.auth.loginWithDev("1");
      // React Native's Jest setup makes `currentState` a mock function; the platform gives a string.
      Object.defineProperty(AppState, "currentState", { configurable: true, value: state });
      const live = jest.spyOn(runtime.live, "start").mockImplementation(() => undefined);
      const sync = jest.spyOn(runtime.sync, "start").mockImplementation(() => undefined);
      startSenders(runtime);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(live).toHaveBeenCalledTimes(starts);
    },
  );
});
