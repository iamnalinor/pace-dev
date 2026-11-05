import { renderHook, waitFor } from "@testing-library/react-native";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { paceNative } from "../../modules/pace-native/index.ts";
import { firebaseRuntimeStore } from "./firebase-runtime.ts";
import { useServerOrigin } from "./server-origin.ts";
import { serverStore } from "./server-store.ts";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));
const secureStore = jest.requireMock<FakeSecureStore>("expo-secure-store");
afterEach(() => {
  secureStore.readGate = null;
  jest.restoreAllMocks();
});

it("waits for durable origin and reconciles before publishing it, retaining native status offline", async () => {
  const origin = "https://persisted.example";
  const read = Promise.withResolvers<undefined>();
  secureStore.values.set("pace.server", origin);
  secureStore.readGate = read.promise;
  serverStore.setState({ origin: "https://previous.example" });
  const reconcile = jest
    .spyOn(paceNative, "reconcileFirebaseOrigin")
    .mockImplementation((selected) => {
      expect(selected).toBe(origin);
      expect(serverStore.getState().origin).toBe("https://previous.example");
      return { status: "restart-needed", projectId: "actual-old", reason: null };
    });
  const view = await renderHook(() => useServerOrigin(true));
  expect(view.result.current).toBeNull();
  expect(reconcile).not.toHaveBeenCalled();
  read.resolve(undefined);
  await waitFor(() => {
    expect(view.result.current).toBe(origin);
  });
  expect(firebaseRuntimeStore.getState()).toMatchObject({
    origin,
    status: "restart-needed",
    projectId: "actual-old",
  });
  expect(reconcile).toHaveBeenCalledTimes(1);
});
