import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { createOtaCoordinator } from "./ota-coordinator.ts";
import { OtaProvider, useOtaCoordinator } from "./ota-provider.tsx";
import { createNativeOtaCoordinator, startNativeOtaUpdates } from "./ota.ts";

jest.mock("./ota.ts", () => ({
  createNativeOtaCoordinator: jest.fn(),
  startNativeOtaUpdates: jest.fn(),
}));

const Child = ({ account }: { readonly account: string }) => {
  const current = useOtaCoordinator();
  return (
    <Text>{`${account}:${current?.store.getState().diagnostics.runtimeVersion ?? "none"}`}</Text>
  );
};

it("keeps code-delivery ownership while account/server children are replaced", async () => {
  const coordinator = createOtaCoordinator({
    isEnabled: false,
    diagnostics: {
      apkVersion: "1.2.3",
      runtimeVersion: "runtime",
      updateId: null,
      createdAt: null,
      isEmbeddedLaunch: true,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
    },
    now: Date.now,
    check: () => Promise.resolve("none"),
    network: () => Promise.resolve("unknown"),
    fetch: () => Promise.resolve({ kind: "rollback", updateId: null }),
    reload: () => Promise.resolve(),
  });
  const cleanup = jest.fn();
  jest.mocked(createNativeOtaCoordinator).mockReturnValue(coordinator);
  jest.mocked(startNativeOtaUpdates).mockReturnValue(cleanup);
  const rendered = await render(
    <OtaProvider>
      <Child account="A" />
    </OtaProvider>,
  );
  expect(screen.getByText("A:runtime")).toBeOnTheScreen();
  await rendered.rerender(
    <OtaProvider>
      <Child account="B" />
    </OtaProvider>,
  );
  expect(screen.getByText("B:runtime")).toBeOnTheScreen();
  expect(createNativeOtaCoordinator).toHaveBeenCalledTimes(1);
  expect(startNativeOtaUpdates).toHaveBeenCalledTimes(1);
  expect(cleanup).not.toHaveBeenCalled();
  await rendered.unmount();
  expect(cleanup).toHaveBeenCalledTimes(1);
});
