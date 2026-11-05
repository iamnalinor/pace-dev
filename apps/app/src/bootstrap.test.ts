import { fakeInstance } from "@pace/client/testing";
import { type Instance, InstanceSchema, ok, type Result } from "@pace/core";

import { bootstrap } from "./bootstrap.ts";
import { startPhonePush } from "./phone-runtime.ts";
import { checkServer } from "./platform/server-origin.ts";
import { serverStore } from "./platform/server-store.ts";
import { createTestRuntime } from "./test/runtime.ts";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));
jest.mock("./phone-runtime.ts", () => ({
  sendPhoneData: jest.fn(async () => undefined),
  startPhonePush: jest.fn(async () => undefined),
}));
jest.mock("./senders.ts", () => ({ canStartSenders: () => true, startSenders: jest.fn() }));
jest.mock("./local-copy.ts", () => ({ claimLocalCopy: jest.fn(async () => undefined) }));
jest.mock("./platform/background-check.ts", () => ({
  startBackgroundCheck: jest.fn(async () => undefined),
}));

it("awaits the watcher's discovery before push without a second discovery request", async () => {
  const runtime = await createTestRuntime({ world: "empty" });
  const answer = Promise.withResolvers<Result<Instance, never>>();
  const check = jest
    .spyOn(runtime, "checkInstance")
    .mockImplementation(async () => await answer.promise);
  jest.spyOn(runtime.actions, "ensureInstances").mockResolvedValue(0);
  jest.spyOn(runtime.sync, "syncNow").mockResolvedValue(ok({ pulled: 0, pushed: 0 }));
  serverStore.setState({ origin: runtime.baseUrl });
  const watching = checkServer(runtime);
  const booting = bootstrap(runtime, {
    pool: { refresh: async () => undefined, isFresh: () => false },
    session: undefined,
    zoneSettled: async () => undefined,
  });
  // All other bootstrap work is immediate: only discovery may hold token registration.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(startPhonePush).not.toHaveBeenCalled();
  answer.resolve(ok(InstanceSchema.parse(fakeInstance)));
  await Promise.all([watching, booting]);
  expect(check).toHaveBeenCalledTimes(1);
  expect(startPhonePush).toHaveBeenCalledTimes(1);
});
