import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { API_BASE_URL } from "./api-base.ts";
import { createSecureSessionStore } from "./secure-session.ts";

// The fake is created when expo-secure-store is first required (after the import above).
jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());

const mockSecureStore =
  jest.requireMock<mockSecureStoreModule.FakeSecureStore>("expo-secure-store");

const A = "https://a.example.dev";
const B = "https://b.example.dev";

beforeEach(() => {
  mockSecureStore.values.clear();
});

describe("createSecureSessionStore", () => {
  it("has no token until one is set", async () => {
    const session = createSecureSessionStore(A);
    await expect(session.get()).resolves.toBeNull();
  });

  it("stores the token with its server under the session key and forgets it on clear", async () => {
    const session = createSecureSessionStore(A);
    await session.set("tok_1");
    await expect(session.get()).resolves.toBe("tok_1");
    expect(JSON.parse(mockSecureStore.values.get("pace.session") ?? "null")).toEqual({
      origin: A,
      token: "tok_1",
    });
    await session.clear();
    await expect(session.get()).resolves.toBeNull();
  });

  it("never hands one server's token to another", async () => {
    await createSecureSessionStore(A).set("tok_a");
    await expect(createSecureSessionStore(B).get()).resolves.toBeNull();
    await expect(createSecureSessionStore(A).get()).resolves.toBe("tok_a");
  });

  it("reads a token stored before servers could be chosen as the build's own server's", async () => {
    mockSecureStore.values.set("pace.session", "tok_old");
    await expect(createSecureSessionStore(API_BASE_URL).get()).resolves.toBe("tok_old");
    await expect(createSecureSessionStore(B).get()).resolves.toBeNull();
  });
});
