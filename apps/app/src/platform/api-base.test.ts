import type * as ApiBase from "./api-base.ts";

import { ANDROID_SMOKE_API_URL } from "../../android-smoke.ts";

const mockExtra = {
  current: {
    apiUrl: "https://api.test",
    isDevLogin: false,
    webOrigin: "https://web.test",
  },
};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra.current };
    },
  },
}));

describe("api-base", () => {
  it("reads the API url and web origin from the Expo config extras", () => {
    jest.isolateModules(() => {
      const settings = jest.requireActual<typeof ApiBase>("./api-base.ts");
      expect(settings.API_BASE_URL).toBe("https://api.test");
      expect(settings.WEB_ORIGIN).toBe("https://web.test");
    });
  });

  it.each([
    [ANDROID_SMOKE_API_URL, true, true],
    [ANDROID_SMOKE_API_URL, false, false],
    ["https://pace-api.nalinor.dev", true, false],
    ["http://localhost:8787", true, false],
  ])(
    "in a native release with API %s and explicit flag %s is enabled: %s",
    (apiUrl, isDevLogin, expected) => {
      const isDevelopment = __DEV__;
      const extra = mockExtra.current;
      Reflect.set(globalThis, "__DEV__", false);
      mockExtra.current = { ...extra, apiUrl, isDevLogin };
      try {
        jest.isolateModules(() => {
          const settings = jest.requireActual<typeof ApiBase>("./api-base.ts");
          expect(settings.isNativeDevLoginEnabled()).toBe(expected);
        });
      } finally {
        mockExtra.current = extra;
        Reflect.set(globalThis, "__DEV__", isDevelopment);
      }
    },
  );
});
