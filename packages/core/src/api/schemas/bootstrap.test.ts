import { describe, expect, it } from "vitest";

import { endpoints } from "../endpoints.ts";
import { LiveServerMessageSchema, parseLiveClientMessage } from "../live-protocol.ts";
import { readPulledEvent, SyncPullOutputSchema, SyncPullQuerySchema } from "./sync.ts";

/**
What a newer client wrote and an older one reads back: a type and a source it has no word for.
The answer that carries it must still be read (bug-lessons 13, 150): the record's place in the
log is the contract, its event is the reader's to judge.
*/
const fromNewerClient = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAA",
  type: "future.thing",
  occurredAt: "2026-10-06T08:00:00.000Z",
  recordedAt: "2026-10-06T08:00:00.000Z",
  deviceId: "watch-1",
  precision: "rough",
  source: "watch",
  payload: { anything: true },
};

const isBootstrapRead = (records: unknown): boolean =>
  endpoints.sync.bootstrap.output.safeParse({
    kind: "checkpoint",
    storeId: "store",
    checkpointJson: "{}",
    checkpointSha256: "a".repeat(64),
    throughSeq: 3,
    records,
    seq: 3,
    more: false,
  }).success;

const pullOf = (records: unknown) =>
  SyncPullOutputSchema.safeParse({ events: [], records, seq: 1, more: false, storeId: "store" });

const isEventsMessageRead = (records: unknown): boolean =>
  LiveServerMessageSchema.safeParse({
    type: "events",
    since: 0,
    events: [],
    records,
    seq: 1,
    more: false,
    storeId: "store",
  }).success;

describe("checkpoint sync contracts", () => {
  it("exposes an explicit source fallback and a bootstrap whose records keep their place", () => {
    expect(
      endpoints.sync.bootstrap.output.safeParse({ kind: "source", storeId: "store" }).success,
    ).toBe(true);
    expect(isBootstrapRead([{ seq: 0, event: fromNewerClient }])).toBe(false);
    expect(isBootstrapRead([{ event: fromNewerClient }])).toBe(false);
    expect(isBootstrapRead([{ seq: 3, event: fromNewerClient }])).toBe(true);
  });
  it("keeps pinned history and ordinary enhanced pull negotiation", () => {
    expect(
      SyncPullQuerySchema.parse({
        since: "0",
        storeId: "store",
        through: "3",
        checkpointVersion: "1",
      }),
    ).toMatchObject({ storeId: "store", through: 3, checkpointVersion: 1 });
    expect(pullOf([{ seq: 1.5, event: fromNewerClient }]).success).toBe(false);
    // A page with an event of a newer client is read; the record comes through as it was sent.
    expect(pullOf([{ seq: 1, event: fromNewerClient, extra: true }])).toMatchObject({
      success: true,
      data: { records: [{ seq: 1, event: fromNewerClient }] },
    });
  });
  it("accepts additive socket negotiation and refuses records out of place", () => {
    expect(
      parseLiveClientMessage(
        JSON.stringify({ type: "pull", id: "p", since: 0, checkpointVersion: 1 }),
      ).ok,
    ).toBe(true);
    expect(isEventsMessageRead([{ seq: 0, event: fromNewerClient }])).toBe(false);
    expect(isEventsMessageRead([{ seq: 1, event: fromNewerClient }])).toBe(true);
  });
  it("reads a tail's event as a pull does: unknown words stand in, a broken envelope is none", () => {
    expect(readPulledEvent(fromNewerClient)).toEqual({
      ...fromNewerClient,
      precision: "approx",
      source: "system",
    });
    expect(readPulledEvent({ ...fromNewerClient, id: "" })).toBeNull();
    expect(readPulledEvent({})).toBeNull();
  });
});
