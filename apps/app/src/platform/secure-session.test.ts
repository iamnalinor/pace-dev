import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { createSecureSessionStore } from "./secure-session.ts";

// The fake is created when expo-secure-store is first required (after the import above).
jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());

const mockSecureStore =
  jest.requireMock<mockSecureStoreModule.FakeSecureStore>("expo-secure-store");

beforeEach(() => {
  mockSecureStore.values.clear();
});

describe("createSecureSessionStore", () => {
  it("has no token until one is set", async () => {
    const session = createSecureSessionStore();
    await expect(session.get()).resolves.toBeNull();
  });

  it("stores the token under the session key and forgets it on clear", async () => {
    const session = createSecureSessionStore();
    await session.set("tok_1");
    await expect(session.get()).resolves.toBe("tok_1");
    expect(mockSecureStore.values.get("pace.session")).toBe("tok_1");
    await session.clear();
    await expect(session.get()).resolves.toBeNull();
  });
});
