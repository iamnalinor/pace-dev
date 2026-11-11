import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { PaceProvider, useIsAccountUnknown, useIsFirstSync } from "#app/app-state.tsx";
import { checkpointFixture } from "#app/platform/checkpoint-store-contract.fake.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { createMemoryEventStore } from "@pace/client";
import { fakeUser } from "@pace/client/testing";

// The persisted-copy gate is observed before any first sync can finish.
jest.mock("./sync-loop.ts", () => ({ runSyncLoop: () => () => undefined }));

const CopyReadiness = () => {
  const isUnknown = useIsAccountUnknown();
  const isFirstSync = useIsFirstSync();
  return (
    <>
      <Text>{isUnknown ? "account-unknown" : "account-known"}</Text>
      <Text>{isFirstSync ? "first-sync" : "local-copy-ready"}</Text>
    </>
  );
};

it("recognizes checkpoint ids as a nonempty account when no source envelopes are resident", async () => {
  const disk = createMemoryEventStore();
  await disk.installBootstrap({
    guard: await disk.readSnapshot(),
    checkpoint: await checkpointFixture(),
    records: [],
    seq: 1,
    syncVersion: 2,
  });
  const runtime = await createTestRuntime({
    world: "empty",
    eventStore: disk,
    routes: { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) },
  });
  await runtime.auth.loginWithDev("1");
  expect(runtime.state.store.getState().events).toEqual([]);
  expect(runtime.state.store.getState().knownEventIds.size).toBe(1);
  await render(
    <PaceProvider runtime={runtime}>
      <CopyReadiness />
    </PaceProvider>,
  );
  expect(screen.getByText("account-known")).toBeOnTheScreen();
  expect(screen.getByText("local-copy-ready")).toBeOnTheScreen();
});
