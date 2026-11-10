import { createOtaCoordinator, type OtaPorts } from "./ota-coordinator.ts";
import { startOtaLifecycle } from "./ota-lifecycle.ts";

const NOTHING = (): void => undefined;
const subscribeNoop = (): (() => void) => NOTHING;

it("checks at launch and foreground, then removes listeners and retires late work", async () => {
  const ports: OtaPorts = {
    isEnabled: true,
    diagnostics: {
      apkVersion: "1.2.3",
      runtimeVersion: null,
      updateId: null,
      createdAt: null,
      isEmbeddedLaunch: true,
      isEmergencyLaunch: true,
      emergencyLaunchReason: "native recovery",
    },
    now: () => 0,
    check: jest.fn(async () => {
      await Promise.resolve();
      return "none" as const;
    }),
    network: jest.fn(async () => {
      await Promise.resolve();
      return "unknown" as const;
    }),
    fetch: jest.fn(async () => {
      await Promise.resolve();
      return { kind: "rollback" as const, updateId: null };
    }),
    reload: jest.fn(async () => {
      await Promise.resolve();
    }),
  };
  const foreground = { listener: null as (() => void) | null, unsubscribe: jest.fn() };
  const coordinator = createOtaCoordinator(ports);
  const stop = startOtaLifecycle(coordinator, {
    subscribe: (listener) => {
      foreground.listener = listener;
      return foreground.unsubscribe;
    },
  });
  foreground.listener?.();
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(1);
  expect(coordinator.store.getState().diagnostics).toMatchObject({
    isEmbeddedLaunch: true,
    isEmergencyLaunch: true,
  });
  stop();
  foreground.listener?.();
  await coordinator.check();
  expect(foreground.unsubscribe).toHaveBeenCalledTimes(1);
  expect(ports.check).toHaveBeenCalledTimes(1);
});

it("survives effect cleanup/replay without accepting completion from the retired lifetime", async () => {
  const time = { now: 0 };
  const { promise, resolve } = Promise.withResolvers<"available">();
  const check = jest.fn(async () => {
    await Promise.resolve();
    return "available" as const;
  });
  check.mockReturnValueOnce(promise);
  const fetch = jest.fn(async () => {
    await Promise.resolve();
    return { kind: "update" as const, updateId: "ready" };
  });
  const coordinator = createOtaCoordinator({
    isEnabled: true,
    diagnostics: {
      apkVersion: "1.2.3",
      runtimeVersion: null,
      updateId: null,
      createdAt: null,
      isEmbeddedLaunch: true,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
    },
    now: () => time.now,
    check,
    network: () => Promise.resolve("unmetered-wifi"),
    fetch,
    reload: () => Promise.resolve(),
  });
  const foreground = { subscribe: subscribeNoop };
  const stopFirst = startOtaLifecycle(coordinator, foreground);
  stopFirst();
  const stopSecond = startOtaLifecycle(coordinator, foreground);
  resolve("available");
  await coordinator.check();
  // The retired lifetime's answer downloads nothing; the replayed one asked on its own (it is not
  // left waiting an hour for the stale run) and downloads once.
  expect(check).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(coordinator.store.getState().ready).toEqual({ kind: "update", updateId: "ready" });
  stopSecond();
});
