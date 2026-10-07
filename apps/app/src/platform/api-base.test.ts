import { API_BASE_URL, WEB_ORIGIN } from "./api-base.ts";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: "https://api.test", webOrigin: "https://web.test" } },
  },
}));

describe("api-base", () => {
  it("reads the API url and web origin from the Expo config extras", () => {
    expect(API_BASE_URL).toBe("https://api.test");
    expect(WEB_ORIGIN).toBe("https://web.test");
  });
});
