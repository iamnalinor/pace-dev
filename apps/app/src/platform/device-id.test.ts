import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { loadDeviceId } from "./device-id.ts";

// The fake is created when expo-secure-store is first required (after the import above).
jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());

const mockSecureStore =
  jest.requireMock<mockSecureStoreModule.FakeSecureStore>("expo-secure-store");

beforeEach(() => {
  mockSecureStore.values.clear();
});

describe("loadDeviceId", () => {
  it("mints a ULID on first use and returns the same id afterwards", async () => {
    const first = await loadDeviceId();
    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    await expect(loadDeviceId()).resolves.toBe(first);
    expect(mockSecureStore.values.get("pace.deviceId")).toBe(first);
  });
});
