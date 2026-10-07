// RNTL v14 registers its Jest matchers when imported.
import "@testing-library/react-native";
// Gesture handler's native module is replaced by its own Jest doubles.
import "react-native-gesture-handler/jestSetup";

// Reanimated 4 and its worklets runtime need their JS mocks: the native module is absent in Jest.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
