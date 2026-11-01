import { describe, expect, it } from "vitest";

import { endpoints } from "./endpoints.ts";
import {
  LIVE_MAX_IN_FLIGHT,
  LIVE_PAGE,
  LIVE_REQUEST_TIMEOUT_MS,
  LIVE_SESSION_ENDED,
  LIVE_V1,
  LIVE_V2,
  LiveServerMessageSchema,
  parseLiveClientMessage,
} from "./live-protocol.ts";
import { SyncPushBodySchema } from "./schemas/sync.ts";

/** A complete task.created envelope, as the HTTP sync tests push it. */
const event = (overrides: Record<string, unknown> = {}) => ({
  deviceId: "dev-1",
  id: "01JA0000000000000000000001",
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "preset-work", subtasks: [], taskId: "t-1", title: "t" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
  ...overrides,
});

const push = (body: Record<string, unknown>): string =>
  JSON.stringify({ id: "r-1", type: "push", ...body });

describe("the live socket's client messages", () => {
  it("names the subprotocols and the window the client keeps", () => {
    expect([LIVE_V1, LIVE_V2]).toEqual(["pace.v1", "pace.v2"]);
    expect([LIVE_PAGE, LIVE_REQUEST_TIMEOUT_MS, LIVE_MAX_IN_FLIGHT]).toEqual([200, 10_000, 4]);
  });

  it("closes a socket whose session ended with a code an app may send and receive", () => {
    // 4000-4999 are the application's own (RFC 6455 §7.4.2); 4401 reads as "unauthorized".
    expect(LIVE_SESSION_ENDED).toBe(4401);
  });

  it("reads a push with the body the HTTP push takes", () => {
    const body = { events: [event()], storeId: "store-1" };
    expect(parseLiveClientMessage(push(body))).toEqual({
      ok: true,
      value: { id: "r-1", type: "push", ...SyncPushBodySchema.parse(body) },
    });
  });

  it("shares one push body schema with the HTTP endpoint", () => {
    expect(endpoints.sync.push.body).toBe(SyncPushBodySchema);
  });

  it("refuses every push the HTTP body refuses (the sync tests' refused batches)", () => {
    const refused = [
      // 422 on HTTP: a precision the envelope does not know.
      { events: [event(), event({ precision: "fuzzy" })], storeId: "store-1" },
      // 422 on HTTP: no store named.
      { events: [event()] },
      // Past the 500-event limit.
      { events: Array.from({ length: 501 }, () => event()), storeId: "store-1" },
    ];
    for (const body of refused) {
      expect(SyncPushBodySchema.safeParse(body).success).toBe(false);
      expect(parseLiveClientMessage(push(body))).toEqual({ error: "bad-request", ok: false });
    }
  });

  it("reads a pull, with or without a limit", () => {
    expect(parseLiveClientMessage(JSON.stringify({ id: "p", since: 0, type: "pull" }))).toEqual({
      ok: true,
      value: { id: "p", since: 0, type: "pull" },
    });
    expect(
      parseLiveClientMessage(JSON.stringify({ id: "p", limit: 500, since: 7, type: "pull" })),
    ).toEqual({ ok: true, value: { id: "p", limit: 500, since: 7, type: "pull" } });
  });

  it("refuses what is not a request it knows: strict, as every input", () => {
    const refused = [
      "not json",
      "ping",
      "null",
      "[]",
      JSON.stringify({ id: "x", type: "subscribe" }),
      JSON.stringify({ since: 0, type: "pull" }),
      JSON.stringify({ id: "", since: 0, type: "pull" }),
      JSON.stringify({ id: "x".repeat(65), since: 0, type: "pull" }),
      JSON.stringify({ id: "p", since: -1, type: "pull" }),
      JSON.stringify({ id: "p", since: 1.5, type: "pull" }),
      JSON.stringify({ id: "p", since: "3", type: "pull" }),
      JSON.stringify({ id: "p", limit: 0, since: 0, type: "pull" }),
      JSON.stringify({ id: "p", limit: 501, since: 0, type: "pull" }),
      JSON.stringify({ extra: true, id: "p", since: 0, type: "pull" }),
      push({ events: [], extra: true, storeId: "s" }),
    ];
    for (const data of refused) {
      expect(parseLiveClientMessage(data)).toEqual({ error: "bad-request", ok: false });
    }
  });
});

/** One of each message the server sends, as it sends it today. */
const SERVER_MESSAGES = [
  { protocol: "pace.v2", type: "hello" },
  { accepted: ["a"], id: "r-1", rejected: [{ id: "b", reason: "type" }], seq: 3, type: "pushed" },
  { events: [event()], more: false, seq: 3, since: 2, storeId: "s", type: "events" },
  { events: [], id: "p", more: true, seq: 3, since: 0, storeId: "s", type: "events" },
  { code: "store/changed", id: "r-1", type: "error" },
  { code: "bad-request", id: "", type: "error" },
  { seq: 3, type: "changed" },
  { type: "read" },
  { type: "push-methods-changed" },
  { id: "n-1", resolution: "attended", type: "dismiss" },
] as const;

describe("the live socket's server messages", () => {
  it("reads every message the server sends", () => {
    for (const message of SERVER_MESSAGES) {
      expect(LiveServerMessageSchema.parse(message)).toEqual(message);
    }
  });

  it("drops a key a newer server adds to any message (class 13)", () => {
    for (const message of SERVER_MESSAGES) {
      expect(LiveServerMessageSchema.parse({ ...message, later: 1 })).toEqual(message);
    }
  });

  it("tolerates a message type a newer server adds, as an unknown one", () => {
    expect(LiveServerMessageSchema.parse({ type: "presence", who: "x" })).toEqual({
      received: "presence",
      type: "unknown",
    });
  });

  it("refuses a known message that is off-contract (class 12 catches it in tests)", () => {
    const broken = [
      { accepted: ["a"], id: "r-1", rejected: [], type: "pushed" },
      { events: [], more: false, seq: 1, storeId: "s", type: "events" },
      { code: "store/changed", type: "error" },
      { type: "changed" },
      { type: "hello" },
      { seq: 1 },
    ];
    for (const message of broken) {
      expect(LiveServerMessageSchema.safeParse(message).success).toBe(false);
    }
  });
});
