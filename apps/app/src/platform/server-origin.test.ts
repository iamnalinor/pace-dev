import { createStore } from "zustand/vanilla";

import type { InstanceError } from "@pace/client";

import { fakeInstance } from "@pace/client/testing";
import { type Instance, InstanceSchema, ok, type Result } from "@pace/core";

import {
  checkServer,
  CONFIGURATION_RECHECK_MAX_MS,
  CONFIGURATION_RECHECK_MIN_MS,
  watchServer,
} from "./server-origin.ts";
import { applyInstanceCheck, serverStore } from "./server-store.ts";

describe("explicit server configuration retry", () => {
  it("ignores a successful retry after the person moved to another server", async () => {
    const answer = Promise.withResolvers<Result<Instance, InstanceError>>();
    const checkInstance = jest.fn(async () => await answer.promise);
    serverStore.setState({
      origin: "https://old.example",
      configurationError: { reason: "project-mismatch" },
    });
    const retry = checkServer({ baseUrl: "https://old.example", checkInstance });
    serverStore.setState({
      origin: "https://new.example",
      configurationError: { reason: "missing-service-account" },
    });
    answer.resolve(ok(InstanceSchema.parse(fakeInstance)));
    await retry;
    expect(serverStore.getState().configurationError).toEqual({
      reason: "missing-service-account",
    });
    expect(checkInstance).toHaveBeenCalledTimes(1);
  });
});

it("shares discovery while a start and watcher ask together", async () => {
  const answer = Promise.withResolvers<Result<Instance, InstanceError>>();
  const checkInstance = jest.fn(async () => await answer.promise);
  const runtime = { baseUrl: "https://same.example", checkInstance };
  serverStore.setState({ origin: runtime.baseUrl });
  const first = checkServer(runtime);
  const second = checkServer(runtime);
  answer.resolve(ok(InstanceSchema.parse(fakeInstance)));
  await Promise.all([first, second]);
  expect(checkInstance).toHaveBeenCalledTimes(1);
});

describe("a misconfigured server, asked again on its own (no tap, no return to the app)", () => {
  const origin = "https://broken.example";
  const misconfigured: Result<Instance, InstanceError> = {
    ok: false,
    error: { kind: "server-misconfigured", reason: "project-mismatch" },
  };
  const watched = (checkInstance: () => Promise<Result<Instance, InstanceError>>) =>
    ({
      auth: { store: createStore(() => ({ status: "loading" })) },
      baseUrl: origin,
      checkInstance,
    }) as unknown as Parameters<typeof watchServer>[0];

  beforeEach(() => {
    jest.useFakeTimers();
    serverStore.setState({ origin, configurationError: null, status: "unknown", reason: null });
  });
  afterEach(() => {
    jest.useRealTimers();
    serverStore.setState({ configurationError: null });
  });

  it("re-checks with a growing delay until the server answers, then stops", async () => {
    const answers = [misconfigured, misconfigured];
    const checkInstance = jest.fn(
      async () => answers.shift() ?? ok(InstanceSchema.parse(fakeInstance)),
    );
    const stop = watchServer(watched(checkInstance));
    applyInstanceCheck(origin, misconfigured);
    await jest.advanceTimersByTimeAsync(CONFIGURATION_RECHECK_MIN_MS - 1);
    expect(checkInstance).toHaveBeenCalledTimes(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(checkInstance).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2 * CONFIGURATION_RECHECK_MIN_MS - 1);
    expect(checkInstance).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(checkInstance).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4 * CONFIGURATION_RECHECK_MIN_MS);
    expect(checkInstance).toHaveBeenCalledTimes(3);
    expect(serverStore.getState().configurationError).toBeNull();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(checkInstance).toHaveBeenCalledTimes(3);
    stop();
  });

  it("keeps asking at the longest delay, and asks nothing once the watch is stopped", async () => {
    const checkInstance = jest.fn(async () => misconfigured);
    const stop = watchServer(watched(checkInstance));
    applyInstanceCheck(origin, misconfigured);
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    const calls = checkInstance.mock.calls.length;
    await jest.advanceTimersByTimeAsync(CONFIGURATION_RECHECK_MAX_MS);
    expect(checkInstance).toHaveBeenCalledTimes(calls + 1);
    stop();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(checkInstance).toHaveBeenCalledTimes(calls + 1);
  });
});
