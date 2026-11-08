import type * as ExpoCrypto from "expo-crypto";
import type * as NodeCrypto from "node:crypto";
import type * as ReactNative from "react-native";

import type * as RouterFake from "./src/test/router.ts";
import type * as BackgroundFake from "./src/testing/background-task.fake.ts";
import type * as CalendarFake from "./src/testing/calendar.fake.ts";
import type * as KvStoreFake from "./src/testing/kv-store.fake.ts";
import type * as NotificationsFake from "./src/testing/notifications.fake.ts";
import type * as SecureStoreFake from "./src/testing/secure-store.fake.ts";

// RNTL v14 registers its Jest matchers when imported.
import "@testing-library/react-native";
// Gesture handler's native module is replaced by its own Jest doubles.
import "react-native-gesture-handler/jestSetup";

// Reanimated 4 and its worklets runtime need their JS mocks: the native module is absent in Jest.
jest.mock("react-native-worklets", (): unknown =>
  jest.requireActual("react-native-worklets/src/mock"),
);
jest.mock("react-native-reanimated", (): unknown =>
  jest.requireActual("react-native-reanimated/mock"),
);
// Native storage and navigation have in-memory doubles; a test file may still mock them itself.
jest.mock("expo-secure-store", () =>
  jest
    .requireActual<typeof SecureStoreFake>("./src/testing/secure-store.fake.ts")
    .createFakeSecureStore(),
);
// The drafts' key-value store (feedback 5 item 7): in memory, emptied before every test.
jest.mock("expo-sqlite/kv-store", () =>
  jest.requireActual<typeof KvStoreFake>("./src/testing/kv-store.fake.ts").createFakeKvStore(),
);
beforeEach(() => {
  jest
    .requireMock<{ readonly default: { readonly values: Map<string, string> } }>(
      "expo-sqlite/kv-store",
    )
    .default.values.clear();
});
jest.mock("expo-calendar", () =>
  jest.requireActual<typeof CalendarFake>("./src/testing/calendar.fake.ts").createFakeCalendar(),
);
jest.mock("expo-crypto", () => {
  const actual = jest.requireActual<typeof ExpoCrypto>("expo-crypto");
  const { createHash } = jest.requireActual<typeof NodeCrypto>("node:crypto");
  return {
    ...actual,
    digestStringAsync: async (_algorithm: unknown, data: string) =>
      createHash("sha256").update(data).digest("hex"),
  };
});
jest.mock("expo-notifications", () =>
  jest
    .requireActual<typeof NotificationsFake>("./src/testing/notifications.fake.ts")
    .createFakeNotifications(),
);
jest.mock("expo-background-task", () =>
  jest
    .requireActual<typeof BackgroundFake>("./src/testing/background-task.fake.ts")
    .createFakeBackgroundTask(),
);
jest.mock("expo-task-manager", () =>
  jest
    .requireActual<typeof BackgroundFake>("./src/testing/background-task.fake.ts")
    .createFakeTaskManager(),
);
jest.mock("expo-router", () =>
  jest.requireActual<typeof RouterFake>("./src/test/router.ts").routerModule(),
);
// Every test starts on an address without search params.
beforeEach(() => {
  const fake = jest.requireActual<typeof RouterFake>("./src/test/router.ts");
  fake.setSearchParams({});
  fake.paramsSet.mockClear();
});

// A phone's window (390 × 844, the design's phone) unless a test says otherwise: React Native's
// own Jest default, 750 wide, is a `medium` window (spec §3.3), with the rail instead of the tabs.
jest.requireActual<typeof ReactNative>("react-native").Dimensions.set({
  screen: { fontScale: 1, height: 844, scale: 3, width: 390 },
  window: { fontScale: 1, height: 844, scale: 3, width: 390 },
});
