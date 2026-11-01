import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createMemoryEventStore } from "@pace/client";
import { createFakeFetch, fakeInstance } from "@pace/client/testing";
import { InstanceSchema } from "@pace/core";
import { artboardEvents } from "@pace/core/testing";

import { createRuntime } from "../runtime.ts";
import { API_BASE_URL } from "./api-base.ts";
import { createSecureSessionStore } from "./secure-session.ts";
import { serverStore } from "./server-store.ts";
import { readServer, switchServer, writeServer } from "./server.ts";

const A = "https://a.example.dev";
const B = "https://pace.example.dev";
const instanceB = InstanceSchema.parse({ ...fakeInstance, apiOrigin: B });

const secureStore = SecureStore as unknown as FakeSecureStore;

beforeEach(() => {
  secureStore.values.clear();
  serverStore.setState({ instance: null, origin: API_BASE_URL, reason: null, status: "unknown" });
});

const runtimeWithData = async () => {
  const eventStore = createMemoryEventStore();
  const runtime = await createRuntime({
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    eventStore,
    fetch: createFakeFetch({}).fetch,
  });
  await runtime.state.ready;
  await runtime.state.ingest(artboardEvents().slice(0, 5));
  return { eventStore, runtime };
};

describe("the chosen server", () => {
  it("is the build's server until another is written, and again after a reset", async () => {
    await expect(readServer()).resolves.toBe(API_BASE_URL);
    await writeServer(B);
    await expect(readServer()).resolves.toBe(B);
    await writeServer(null);
    await expect(readServer()).resolves.toBe(API_BASE_URL);
  });

  it("drops the stored token when the server changes", async () => {
    const sessionA = createSecureSessionStore(A);
    await sessionA.set("tok_a");
    await writeServer(B);
    await expect(sessionA.get()).resolves.toBeNull();
    await expect(createSecureSessionStore(B).get()).resolves.toBeNull();
  });
});

describe("switchServer", () => {
  it("clears the token and the local log, and the next runtime talks to the new server", async () => {
    const { eventStore, runtime } = await runtimeWithData();
    expect(runtime.baseUrl).toBe(API_BASE_URL);
    await createSecureSessionStore(API_BASE_URL).set("tok_default");
    const reset = jest.spyOn(runtime, "resetLocalData");

    await switchServer(runtime, { instance: instanceB, origin: B });

    expect(reset).toHaveBeenCalledTimes(1);
    await expect(eventStore.listAll()).resolves.toEqual([]);
    expect(secureStore.values.has("pace.session")).toBe(false);
    await expect(readServer()).resolves.toBe(B);
    expect(serverStore.getState()).toEqual({
      instance: instanceB,
      origin: B,
      reason: null,
      status: "ok",
    });
    const next = await createRuntime({
      deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      eventStore: createMemoryEventStore(),
    });
    expect(next.baseUrl).toBe(B);
  });

  it("goes back to the build's server on a reset to default", async () => {
    const { runtime } = await runtimeWithData();
    await switchServer(runtime, { instance: instanceB, origin: B });
    await switchServer(runtime, null);
    await expect(readServer()).resolves.toBe(API_BASE_URL);
    expect(serverStore.getState()).toEqual({
      instance: null,
      origin: API_BASE_URL,
      reason: null,
      status: "unknown",
    });
  });
});
