import type * as RouterFake from "./src/test/router.ts";
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
jest.mock("expo-notifications", () =>
  jest
    .requireActual<typeof NotificationsFake>("./src/testing/notifications.fake.ts")
    .createFakeNotifications(),
);
jest.mock("expo-router", () =>
  jest.requireActual<typeof RouterFake>("./src/test/router.ts").routerModule(),
);
