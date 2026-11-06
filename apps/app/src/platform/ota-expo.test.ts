import { createExpoOtaPorts, type ExpoOtaModule, type OtaNetworkSnapshot } from "./ota-expo.ts";

const fixture = () => {
  const updates: ExpoOtaModule = {
    isEnabled: true,
    runtimeVersion: "native-runtime",
    updateId: "running",
    createdAt: new Date("2026-11-05T00:00:00.000Z"),
    isEmbeddedLaunch: true,
    isEmergencyLaunch: true,
    emergencyLaunchReason: "native fallback",
    checkForUpdateAsync: jest.fn(async () => {
      await Promise.resolve();
      return {
        isAvailable: false as const,
        isRollBackToEmbedded: true as const,
        manifest: undefined,
        reason: undefined,
      };
    }),
    fetchUpdateAsync: jest.fn(async () => {
      await Promise.resolve();
      return { isNew: false as const, isRollBackToEmbedded: true as const, manifest: undefined };
    }),
    reloadAsync: jest.fn(async () => {
      await Promise.resolve();
    }),
  };
  const network = { value: null as OtaNetworkSnapshot };
  return {
    updates,
    network,
    ports: createExpoOtaPorts({
      updates,
      apkVersion: "1.2.3",
      network: () => network.value,
      now: () => 0,
    }),
  };
};

it("uses pinned rollback results and native launch diagnostics", async () => {
  const { updates, ports } = fixture();
  expect(await ports.check()).toBe("rollback");
  expect(await ports.fetch()).toEqual({ kind: "rollback", updateId: null });
  expect(ports.diagnostics).toMatchObject({
    runtimeVersion: "native-runtime",
    createdAt: "2026-11-05T00:00:00.000Z",
    isEmergencyLaunch: true,
    isEmbeddedLaunch: true,
  });
  await ports.reload();
  expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
});

it.each([null, { isWifi: false, isMetered: false }, { isWifi: true, isMetered: true }])(
  "does not infer safe Wi-Fi from an unavailable or metered snapshot: %s",
  async (value) => {
    const { network, ports } = fixture();
    network.value = value;
    expect(await ports.network()).not.toBe("unmetered-wifi");
  },
);

it("permits only a native known-unmetered Wi-Fi snapshot", async () => {
  const { network, ports } = fixture();
  network.value = { isWifi: true, isMetered: false };
  expect(await ports.network()).toBe("unmetered-wifi");
});

it("rejects a fetch with neither a new update nor a rollback", async () => {
  const { updates, ports } = fixture();
  jest
    .mocked(updates.fetchUpdateAsync)
    .mockResolvedValue({ isNew: false, isRollBackToEmbedded: false, manifest: undefined });
  await expect(ports.fetch()).rejects.toThrow("ota-download-unavailable");
});
