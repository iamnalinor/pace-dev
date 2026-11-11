import { createOtaCoordinator, type OtaPorts } from "./ota-coordinator.ts";

const diagnostics = {
  apkVersion: "1.2.3",
  runtimeVersion: "runtime",
  updateId: "running",
  createdAt: "2026-11-05T00:00:00.000Z",
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
};
const fixture = () => {
  const time = { now: 0 };
  const ports: OtaPorts = {
    isEnabled: true,
    diagnostics,
    now: () => time.now,
    check: jest.fn(async () => {
      await Promise.resolve();
      return "available" as const;
    }),
    network: jest.fn(async () => {
      await Promise.resolve();
      return "unmetered-wifi" as const;
    }),
    fetch: jest.fn(async () => {
      await Promise.resolve();
      return { kind: "update" as const, updateId: "downloaded" };
    }),
    reload: jest.fn(async () => {
      await Promise.resolve();
    }),
  };
  return { ports, time, coordinator: createOtaCoordinator(ports) };
};

it("checks at launch and at the hourly boundary, coalescing foreground storms", async () => {
  const { ports, time, coordinator } = fixture();
  await Promise.all([coordinator.check(), coordinator.check(), coordinator.check()]);
  expect(ports.check).toHaveBeenCalledTimes(1);
  expect(ports.fetch).toHaveBeenCalledTimes(1);
  time.now = 3_599_999;
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(1);
  time.now = 3_600_000;
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(2);
});

it.each(["other", "unknown"] as const)(
  "defers assets on %s networks and retries the pending download on safe Wi-Fi",
  async (network) => {
    const { ports, coordinator } = fixture();
    jest.mocked(ports.network).mockResolvedValue(network);
    await coordinator.check();
    expect(ports.fetch).not.toHaveBeenCalled();
    expect(coordinator.store.getState().status).toBe("waiting-wifi");
    jest.mocked(ports.network).mockResolvedValue("unmetered-wifi");
    await coordinator.check();
    expect(ports.check).toHaveBeenCalledTimes(1);
    expect(ports.fetch).toHaveBeenCalledTimes(1);
    expect(coordinator.store.getState().ready).toEqual({ kind: "update", updateId: "downloaded" });
  },
);

it("preserves a downloaded update through later check failure and reports a fixed error", async () => {
  const { ports, time, coordinator } = fixture();
  await coordinator.check();
  time.now = 3_600_000;
  jest.mocked(ports.check).mockRejectedValue(new Error("sensitive transport detail"));
  await coordinator.check();
  expect(coordinator.store.getState()).toMatchObject({
    status: "error",
    error: "check-failed",
    ready: { kind: "update", updateId: "downloaded" },
  });
});

it("asks again at the next trigger after a failed check (offline at launch), not an hour later", async () => {
  const { ports, time, coordinator } = fixture();
  jest.mocked(ports.check).mockRejectedValueOnce(new Error("offline"));
  await coordinator.check();
  expect(coordinator.store.getState().error).toBe("check-failed");
  time.now = 60_000;
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(2);
  expect(coordinator.store.getState()).toMatchObject({
    error: null,
    ready: { kind: "update", updateId: "downloaded" },
  });
});

it("runs its own check after a reactivation, not only the disposed lifetime's stale one", async () => {
  const { ports, coordinator } = fixture();
  const stale = Promise.withResolvers<"available">();
  jest.mocked(ports.check).mockReturnValueOnce(stale.promise);
  const first = coordinator.check();
  coordinator.dispose();
  coordinator.activate?.();
  const second = coordinator.check();
  stale.resolve("available");
  await Promise.all([first, second]);
  expect(ports.check).toHaveBeenCalledTimes(2);
  expect(coordinator.store.getState().ready).toEqual({ kind: "update", updateId: "downloaded" });
});

it.each(["network", "fetch"] as const)(
  "reports %s failure without discarding the pending update",
  async (operation) => {
    const { ports, coordinator } = fixture();
    jest.mocked(ports[operation]).mockRejectedValue(new Error("private detail"));
    await coordinator.check();
    expect(coordinator.store.getState().error).toBe(
      operation === "fetch" ? "download-failed" : "network-failed",
    );
    expect(coordinator.store.getState().ready).toBeNull();
  },
);

it("never reloads automatically, and exposes rollback and launch diagnostics", async () => {
  const { ports, coordinator } = fixture();
  jest.mocked(ports.fetch).mockResolvedValue({ kind: "rollback", updateId: null });
  await coordinator.check();
  expect(ports.reload).not.toHaveBeenCalled();
  expect(coordinator.store.getState()).toMatchObject({
    diagnostics,
    ready: { kind: "rollback", updateId: null },
  });
  await coordinator.restart();
  expect(ports.reload).toHaveBeenCalledTimes(1);
});

it("keeps a ready update after a failed deliberate restart", async () => {
  const { ports, coordinator } = fixture();
  await coordinator.check();
  jest.mocked(ports.reload).mockRejectedValue(new Error("private"));
  await coordinator.restart();
  expect(coordinator.store.getState()).toMatchObject({
    error: "restart-failed",
    ready: { kind: "update" },
  });
});

it("ignores disposed check completion before download or state publication", async () => {
  const { ports, coordinator } = fixture();
  const { promise, resolve } = Promise.withResolvers<"available">();
  jest.mocked(ports.check).mockReturnValue(promise);
  const checking = coordinator.check();
  coordinator.dispose();
  const before = coordinator.store.getState();
  resolve("available");
  await checking;
  expect(ports.network).not.toHaveBeenCalled();
  expect(ports.fetch).not.toHaveBeenCalled();
  expect(coordinator.store.getState()).toBe(before);
});

it("does nothing when disabled or when restart has no ready update", async () => {
  const { ports } = fixture();
  const disabled = createOtaCoordinator({ ...ports, isEnabled: false });
  await disabled.check();
  await disabled.restart();
  expect(ports.check).not.toHaveBeenCalled();
  expect(ports.reload).not.toHaveBeenCalled();
});

it("rechecks disposal between a safe network decision and starting the native download", async () => {
  const { ports, coordinator } = fixture();
  const { promise: network, resolve } = Promise.withResolvers<"unmetered-wifi">();
  const { promise: started, resolve: enter } = Promise.withResolvers<undefined>();
  jest.mocked(ports.network).mockImplementation(async () => {
    enter(undefined);
    return await network;
  });
  const checking = coordinator.check();
  await started;
  resolve("unmetered-wifi");
  await Promise.resolve();
  await Promise.resolve();
  coordinator.dispose();
  const before = coordinator.store.getState();
  await checking;
  expect(ports.fetch).not.toHaveBeenCalled();
  expect(coordinator.store.getState()).toBe(before);
});

it("does not publish a restart rejection from a disposed and reactivated lifetime", async () => {
  const { ports, coordinator } = fixture();
  await coordinator.check();
  const { promise, reject } = Promise.withResolvers<undefined>();
  jest.mocked(ports.reload).mockReturnValue(promise);
  const restarting = coordinator.restart();
  coordinator.dispose();
  coordinator.activate?.();
  const before = coordinator.store.getState();
  reject(new Error("retired restart"));
  await restarting;
  expect(coordinator.store.getState()).toBe(before);
});

it("keeps sequential foreground/network retries quiet after a failed fetch until the hourly boundary", async () => {
  const { ports, time, coordinator } = fixture();
  await coordinator.check();
  const ready = coordinator.store.getState().ready;
  time.now = 3_600_000;
  jest.mocked(ports.fetch).mockRejectedValue(new Error("offline"));
  await coordinator.check();
  await coordinator.check();
  await coordinator.check();
  time.now = 7_199_999;
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(2);
  expect(ports.fetch).toHaveBeenCalledTimes(2);
  expect(coordinator.store.getState()).toMatchObject({ error: "download-failed", ready });
  time.now = 7_200_000;
  await coordinator.check();
  expect(ports.check).toHaveBeenCalledTimes(3);
  expect(ports.fetch).toHaveBeenCalledTimes(3);
});
