import { fireEvent, screen } from "@testing-library/react-native";

import { createOtaCoordinator } from "#app/platform/ota-coordinator.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { OtaDetails } from "./ota-status.tsx";

const fixture = () => {
  const reload = jest.fn(async () => {
    await Promise.resolve();
  });
  const coordinator = createOtaCoordinator({
    isEnabled: true,
    diagnostics: {
      apkVersion: "1.2.3",
      runtimeVersion: "native-runtime",
      updateId: "running-update",
      createdAt: "2026-11-05T00:00:00.000Z",
      isEmbeddedLaunch: false,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
    },
    now: () => 0,
    check: async () => {
      await Promise.resolve();
      return "none";
    },
    network: async () => {
      await Promise.resolve();
      return "unknown";
    },
    fetch: async () => {
      await Promise.resolve();
      return { kind: "update", updateId: "next" };
    },
    reload,
  });
  return { coordinator, reload };
};

it("shows running identifiers and only offers restart for a downloaded update", async () => {
  const { coordinator, reload } = fixture();
  coordinator.store.setState({ status: "ready", ready: { kind: "update", updateId: "next" } });
  await renderScreen(<OtaDetails coordinator={coordinator} />, await createTestRuntime());
  expect(screen.getByText(en("ota.runtime", { value: "native-runtime" }))).toBeOnTheScreen();
  expect(screen.getByText(en("ota.apk", { value: "1.2.3" }))).toBeOnTheScreen();
  expect(screen.getByText(en("ota.update", { value: "running-update" }))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: en("ota.restart") }));
  expect(reload).toHaveBeenCalledTimes(1);
});

it("reports metered-network waiting without a restart or a manual-check loop", async () => {
  const { coordinator } = fixture();
  coordinator.store.setState({ status: "waiting-wifi" });
  await renderScreen(<OtaDetails coordinator={coordinator} />, await createTestRuntime());
  expect(screen.getByText(en("ota.status.waiting-wifi"))).toBeOnTheScreen();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("keeps a previous ready update usable while reporting a later check failure", async () => {
  const { coordinator } = fixture();
  coordinator.store.setState({
    status: "error",
    error: "check-failed",
    ready: { kind: "update", updateId: "next" },
  });
  await renderScreen(<OtaDetails coordinator={coordinator} />, await createTestRuntime());
  expect(screen.getByText(en("ota.error.check-failed"))).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: en("ota.restart") })).toBeOnTheScreen();
});
