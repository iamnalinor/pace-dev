import { afterEach, describe, expect, it, vi } from "vitest";

import { LIVE_MAX_IN_FLIGHT, LIVE_V2, STORE_CHANGED } from "@pace/core";

import { createApiClient } from "./api-client.ts";
import { createFakeFetch, settingsEvent } from "./fake-fetch.fake.ts";
import { fakeSockets, say } from "./fake-socket.fake.ts";
import { createFakeSyncServer } from "./fake-sync-server.fake.ts";
import { LiveUnavailable } from "./live-requests.ts";
import { createLiveChannel } from "./live.ts";
import {
  httpTransport,
  preferSocket,
  socketTransport,
  type SyncTransport,
} from "./sync-transport.ts";

const STORE_ID = "store-a";
const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", "2026-10-06T09:00:00.000Z", {
  language: "ru",
});

/** A live channel and the HTTP API on one fake server, both ways ready. */
const setup = () => {
  const server = createFakeSyncServer(STORE_ID);
  const fake = createFakeFetch(server.routes);
  const api = createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" });
  const live = createLiveChannel({
    baseUrl: "https://api.test",
    createSocket: server.createSocket,
    deviceId: "dev-1",
    onChange: () => undefined,
    token: () => "t",
  });
  live.start();
  server.connect();
  const http = httpTransport(api);
  const socket = socketTransport(live);
  return { http, live, server, socket, transport: preferSocket(socket, http) };
};

describe("sync transports", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["http", (t: ReturnType<typeof setup>): SyncTransport => t.http],
    ["socket", (t: ReturnType<typeof setup>): SyncTransport => t.socket],
  ] as const)("%s: pushes, pulls and reads store/changed the same way", async (name, pick) => {
    const context = setup();
    const transport = pick(context);
    await expect(transport.push([remote], STORE_ID)).resolves.toEqual({
      accepted: [remote.id],
      rejected: [],
      seq: 1,
    });
    await expect(transport.pull(0, 200)).resolves.toEqual({
      events: [remote],
      more: false,
      seq: 1,
      since: 0,
      storeId: STORE_ID,
    });
    await expect(transport.push([remote], "store-old")).resolves.toBe(STORE_CHANGED);
    expect(context.server.requests.map((request) => request.transport)).toEqual([name, name, name]);
    context.live.stop();
  });

  it("refuses over a closed socket with LiveUnavailable, and preferSocket goes over HTTP", async () => {
    const { http, live, server, socket } = setup();
    live.stop();
    await expect(socket.pull(0, 200)).rejects.toBeInstanceOf(LiveUnavailable);
    await expect(preferSocket(socket, http).pull(0, 200)).resolves.toMatchObject({ seq: 0 });
    expect(server.requests).toEqual([{ transport: "http", type: "pull" }]);
  });

  it("falls back only when the socket is unavailable; any other failure is the caller's", async () => {
    const broken: SyncTransport = {
      pull: async () => {
        throw new Error("boom");
      },
      push: async () => {
        throw new Error("boom");
      },
    };
    const { http, live, server } = setup();
    await expect(preferSocket(broken, http).pull(0, 200)).rejects.toThrow("boom");
    await expect(preferSocket(broken, http).push([remote], STORE_ID)).rejects.toThrow("boom");
    expect(server.requests).toEqual([]);
    live.stop();
  });

  it("sends at most four requests at once on the socket; the fifth goes over HTTP", async () => {
    const { live, server, transport } = setup();
    server.options.isHolding = true;
    const pulls = Array.from(
      { length: LIVE_MAX_IN_FLIGHT + 1 },
      async () => await transport.pull(0, 200),
    );
    await vi.waitFor(() => {
      expect(server.requests).toHaveLength(LIVE_MAX_IN_FLIGHT + 1);
    });
    expect(server.requests.filter((request) => request.transport === "socket")).toHaveLength(
      LIVE_MAX_IN_FLIGHT,
    );
    expect(server.requests.filter((request) => request.transport === "http")).toHaveLength(1);
    server.release();
    await expect(Promise.all(pulls)).resolves.toHaveLength(LIVE_MAX_IN_FLIGHT + 1);
    live.stop();
  });

  it("goes over HTTP when the server answers a socket request with something else", async () => {
    const sockets = fakeSockets();
    const server = createFakeSyncServer(STORE_ID);
    const fake = createFakeFetch(server.routes);
    const api = createApiClient({
      baseUrl: "https://api.test",
      fetch: fake.fetch,
      token: () => "t",
    });
    const live = createLiveChannel({
      baseUrl: "https://api.test",
      createSocket: sockets.create,
      deviceId: "dev-1",
      onChange: () => undefined,
      token: () => "t",
    });
    live.start();
    const [raw] = sockets.made;
    if (raw === undefined) {
      throw new Error("no socket");
    }
    raw.open();
    say(raw, { protocol: LIVE_V2, type: "hello" });
    raw.onSend = (data) => {
      const { id } = JSON.parse(data) as { readonly id: string };
      say(raw, { code: "bad-request", id, type: "error" });
    };
    const transport = preferSocket(socketTransport(live), httpTransport(api));
    await expect(transport.push([remote], STORE_ID)).resolves.toMatchObject({ seq: 1 });
    await expect(transport.pull(0, 200)).resolves.toMatchObject({ seq: 1 });
    expect(server.requests.map((request) => request.transport)).toEqual(["http", "http"]);
    live.stop();
  });
});
